// JavaScript sample
const turbines = [{ id: 'WTG-01', kw: 2410 }, { id: 'WTG-02', kw: 0 }];

async function load(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const total = turbines.reduce((sum, t) => sum + t.kw, 0);
console.log(`Total: ${total} kW`);
