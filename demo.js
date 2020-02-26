require('dotenv').config();
const OpenAPI = require('@tinkoff/invest-openapi-js-sdk');
const { DateTime } = require('luxon');
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');

const apiURL = 'https://api-invest.tinkoff.ru/openapi/sandbox';
const socketURL = 'wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws';
const secretToken = process.env.TINKOFF_SANDBOX_TOKEN;

async function getPortfolio() {
  async function login() {
    const body = `email=${encodeURIComponent(process.env.BT_EMAIL)}&password=${encodeURIComponent(process.env.BT_PASSWORD)}&login=`;
    const res = await fetch('https://blackterminal.ru/login', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const h = res.headers.raw()['set-cookie']
      .map(r => /([^=;]+)=([^=;]+)/.exec(r))
      .reduce((acc, r) => {
        acc[r[1].trim()] = r[2].trim()
        return acc
      }, {})

    return h
  }

  async function get(cookies) {
    const res = await fetch(`https://blackterminal.ru/tools/ajax-portfolio-export.php?id=${process.env.BT_PORTFOLIO_ID}&service=bt_json`, {
      headers: {
        Cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join(';')
      }
    })
    return await res.json()
  }

  const cookies = await login();
  return await get(cookies);
}

async function getCandles(api, ticker, from) {
  const now = DateTime.local();

  let resultCandles = [];

  while (from < now) {
    const to = DateTime.min(from.plus({ year: 1 }), now);
    const cacheFile = __dirname + '/cache/' + ticker + '-' + from.toISODate() + '-' + to.toISODate();
    let candles;

    if (fs.existsSync(cacheFile)) {
      candles = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } else {
      const res = await api.candlesGet({
        from: from.toISO(),
        to: to.toISO(),
        figi: (await api.searchOne({ ticker })).figi,
        interval: 'day',
      });

      candles = res.candles;
      fs.writeFileSync(cacheFile, JSON.stringify(candles));
    }

    resultCandles = resultCandles.concat(candles);
    from = to.plus({ days: 1 });
  }

  return resultCandles;
}

const result = [];

async function analyze() {
  const portfolio = await getPortfolio();

  const transactions = Object.values(portfolio.transactions)
    .map(t => ({
      ...t,
      date: DateTime.fromISO(t.date),
    }))
    .sort((a, b) => a.date - b.date);
  const allTickers = transactions.reduce((acc, t) => {
    if (t.ticker && t.ticker !== 'MONEY' && !acc.includes(t.ticker)) {
      acc.push(t.ticker);
    }
    return acc;
  }, []);
  const api = new OpenAPI({ apiURL, secretToken, socketURL });

  let date = DateTime.fromISO('2019-01-01T23:00:00+03:00');
  // let date = DateTime.local();

  while (date <= DateTime.local()) {
    const dayData = {};

    for (const ticker of allTickers) {
      const history = transactions
        .filter(t => t.ticker === ticker || t.asset === ticker)
        .filter(t => {
          return t.date <= date;
        });

      const tickerCandles = history.length > 0
        ? await getCandles(api, ticker.replace(/:.+$/, ''), history[0].date)
        : [];

      const lastCandle = tickerCandles.reverse().find(c => DateTime.fromISO(c.time) <= date);
      const currentPrice = lastCandle ? lastCandle.c : 0;

      const res = history
        .reduce((acc, t) => {
          acc.transactions += 1;
          if (t.operation === 'BUY' && t.type === 'S') {
            acc.quantity += t.quantity;
            acc.spent += t.price * t.quantity;
            acc.fees += t.fee;
          } else if (t.operation === 'BUY' && t.type === 'B') {
            acc.quantity += t.quantity;
            acc.spent += t.price / 100 * t.nominal * t.quantity;
            acc.fees += t.fee;
          } else if (t.operation === 'SELL' && t.type === 'S') {
            acc.quantity -= t.quantity;
            acc.got += t.price * t.quantity;
            acc.fees += t.fee;
          } else if (t.operation === 'BUY' && t.type === 'D') {
            acc.divs += t.price;
          } else {
            throw new Error();
          }
          return acc;
        }, {
          transactions: 0,
          quantity: 0,
          spent: 0,
          got: 0,
          divs: 0,
          fees: 0,
        });

      res.currentPrice = currentPrice;

      if (history.length > 0) {
        if (history[0].currency === 'RUB') {
        } else if (history[0].currency === 'USD') {
          const usdCandles = await getCandles(api, 'USD000UTSTOM', transactions[0].date);
          const lastUsdCandle = usdCandles.reverse().find(c => DateTime.fromISO(c.time) <= date);
          const currentUsdPrice = lastUsdCandle ? lastUsdCandle.c : 0;
          res.spent *= currentUsdPrice;
          res.got *= currentUsdPrice;
          res.divs *= currentUsdPrice;
          res.fees *= currentUsdPrice;
          res.currentPrice *= currentUsdPrice;
        } else {
          throw new Error();
        }
      }

      res.currentValue = res.quantity * res.currentPrice;
      res.outcome = res.spent + res.fees;
      res.income = res.got + res.divs;
      res.total = res.currentValue + res.income - res.outcome;
      res.totalP = res.outcome > 0 ? res.total / res.outcome : 0;

      dayData[ticker] = res;
    }

    result.push({
      date,
      dayData,
    });

    date = date.plus({ days: 1 });
    // break
  }
}

analyze()
  .catch(console.error);

const app = express();

app.use(express.static(__dirname + '/assets'));

app.get('/api/get-data', async (req, res) => {
  res.json(result);
});

app.listen(8080);
