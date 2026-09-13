export const CONFIG_SCOPES = ["global", "agent", "project", "node"];

function flatten(value, prefix = "", output = new Map()) {
  for (const [key, child] of Object.entries(value ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, path, output);
    else output.set(path, child);
  }
  return output;
}

function assignPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
  cursor[parts.at(-1)] = value;
}

export function resolveConfig(layers) {
  const order = new Map(CONFIG_SCOPES.map((scope, index) => [scope, index]));
  const sorted = [...layers].sort((a, b) => order.get(a.scope) - order.get(b.scope));
  const effective = {};
  const provenance = {};
  for (const layer of sorted) {
    if (!order.has(layer.scope)) throw new Error(`Unknown config scope: ${layer.scope}`);
    for (const [path, value] of flatten(layer.values)) {
      assignPath(effective, path, value);
      provenance[path] = { scope: layer.scope, source: layer.source, value };
    }
  }
  return { effective, provenance };
}

