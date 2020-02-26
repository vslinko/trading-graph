const colors = `#e6194B, #3cb44b, #4363d8, #f58231, #911eb4, #42d4f4, #f032e6, #469990, #e6beff, #9A6324, #800000, #808000, #000075, #a9a9a9, #000000`
  .split(",")
  .map(c => c.trim());

function percentFormatter(d) {
  const f = new Intl.NumberFormat("ru-RU", {
    style: "percent",
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });

  return p => {
    return f.format(p);
  };
}

const pFormatter = percentFormatter(0);
const p2Formatter = percentFormatter(2);

function priceFormatter(currency) {
  const f = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency
  });

  return p => {
    return f.format(p);
  };
}

const rubFormatter = priceFormatter("RUB");

function dmFormatter(date) {
  const f = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  });

  return f.format(new Date(date));
}

function dmyFormatter(date) {
  const f = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  return f.format(new Date(date));
}

function TotalChart({ data }) {
  const keys = Object.keys(data[0].dayData);

  const formatters = {
    Total: rubFormatter,
    "Total Relative": p2Formatter
  };

  return (
    <Recharts.ResponsiveContainer width="100%" height={300}>
      <Recharts.LineChart data={data} syncId="same">
        <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
        <Recharts.XAxis dataKey="date" tickFormatter={dmFormatter} />
        <Recharts.YAxis yAxisId={0} tickFormatter={pFormatter} />
        <Recharts.YAxis
          yAxisId={1}
          orientation="right"
          tickFormatter={rubFormatter}
        />
        <Recharts.ReferenceLine y={0} stroke="black" strokeWidth="0.5" />
        <Recharts.Line
          name={"Total Relative"}
          dataKey={row => {
            const { quantity, total, outcome } = keys.reduce(
              (acc, k) => {
                acc.quantity += row.dayData[k].quantity;
                acc.total += row.dayData[k].total;
                acc.outcome += row.dayData[k].outcome;
                return acc;
              },
              { quantity: 0, total: 0, outcome: 0 }
            );

            return quantity > 0 ? total / outcome : null;
          }}
          dot={false}
          activeDot={true}
          isAnimationActive={false}
          stroke={colors[0]}
        />
        <Recharts.Line
          name={"Total"}
          yAxisId={1}
          dataKey={row => {
            const { quantity, total } = keys.reduce(
              (acc, k) => {
                acc.quantity += row.dayData[k].quantity;
                acc.total += row.dayData[k].total;
                return acc;
              },
              { quantity: 0, total: 0 }
            );

            return quantity > 0 ? total : null;
          }}
          dot={false}
          activeDot={true}
          isAnimationActive={false}
          stroke={colors[1]}
        />
        <Recharts.Legend />
        <Recharts.Tooltip
          formatter={(value, name) => [formatters[name](value), name]}
          labelFormatter={dmyFormatter}
        />
      </Recharts.LineChart>
    </Recharts.ResponsiveContainer>
  );
}

function DetailChart({ data }) {
  const [disabled, setDisabled] = React.useState({});


  const keys = Object.keys(data[0].dayData);

  const { max, min } = data.reduce((acc, row) => {
    return keys.reduce((acc, key) => {
      const v = row.dayData[key].totalP
      if (v > acc.max) {
        acc.max = v
      }
      if (v < acc.min) {
        acc.min = v
      }
      return acc
    }, acc)
  }, { max: 0, min: 0 })

  const domain = [
    Math.floor(min * 100 / 25) * 25 / 100,
    Math.ceil(max * 100 / 25) * 25 / 100,
  ];

  const onClick = (line, i, event) => {
    const { value } = line;

    const otherDisabled = keys
      .filter(k => k !== value)
      .every(k => !!disabled[k]);

    if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (!otherDisabled || disabled[value]) {
        setDisabled({
          ...disabled,
          [value]: !disabled[value]
        });
      }
    } else if (
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {

      setDisabled(
        keys.reduce((acc, key) => {
          acc[key] = otherDisabled ? false : key !== value;
          return acc;
        }, {})
      );
    }
  };

  return (
    <Recharts.ResponsiveContainer width="100%" height={300}>
      <Recharts.LineChart data={data} syncId="same">
        <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
        <Recharts.XAxis dataKey="date" tickFormatter={dmFormatter} />
        <Recharts.YAxis domain={domain} tickFormatter={pFormatter} />
        <Recharts.ReferenceLine y={0} stroke="black" strokeWidth="0.5" />
        {keys.map((key, i) => (
          <Recharts.Line
            key={key}
            name={key}
            hide={disabled[key]}
            dataKey={row =>
              row.dayData[key].quantity > 0 ? row.dayData[key].totalP : null
            }
            dot={false}
            activeDot={true}
            isAnimationActive={false}
            stroke={colors[i % colors.length]}
          />
        ))}
        <Recharts.Legend
          formatter={value => value.replace(/:.*/, "")}
          onClick={onClick}
        />
        <Recharts.Tooltip
          formatter={(value, name) => [
            p2Formatter(value),
            name.replace(/:.*/, "")
          ]}
          labelFormatter={dmyFormatter}
        />
      </Recharts.LineChart>
    </Recharts.ResponsiveContainer>
  );
}

function App({ data }) {
  return (
    <>
      <h2>Total Chart</h2>
      <TotalChart data={data} />
      <h2>Detail Chart</h2>
      <DetailChart data={data} />
    </>
  );
}

async function main() {
  try {
    const res = await fetch("/api/get-data");
    const data = await res.json();

    ReactDOM.render(<App data={data} />, document.querySelector("#app"));
  } catch (err) {
    console.error(err);
  }
}

main();
