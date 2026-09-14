import { upgradeModel, type Model, type Operation } from './model';
export type FeatureChange = {
  id: string;
  name: string;
  before?: Operation;
  after?: Operation;
  details: string[];
};
const vector = (v: number[]) => v.map((n) => Number(n.toFixed(4))).join(', ');
export function featureChanges(before: Model, after: Model): FeatureChange[] {
  const a = upgradeModel(before).operations,
    b = upgradeModel(after).operations;
  const old = new Map(a.map((o) => [o.id!, o]));
  const next = new Map(b.map((o) => [o.id!, o]));
  return [...new Set([...old.keys(), ...next.keys()])].flatMap((id) => {
    const left = old.get(id),
      right = next.get(id),
      details: string[] = [];
    if (!left)
      details.push(
        `Added · dimensions ${vector(right!.size)} mm · center ${vector(right!.position)} mm`,
      );
    else if (!right)
      details.push(
        `Removed · dimensions ${vector(left.size)} mm · center ${vector(left.position)} mm`,
      );
    else {
      if (
        (left.color || '#778ee0').toLowerCase() !==
        (right.color || '#778ee0').toLowerCase()
      )
        details.push(
          `Color: ${left.color || '#778ee0'} → ${right.color || '#778ee0'}`,
        );
      if (left.name !== right.name)
        details.push(`Renamed: ${left.name} → ${right.name}`);
      for (const [key, label, unit] of [
        ['size', 'Dimensions', 'mm'],
        ['position', 'Center', 'mm'],
        ['rotation', 'Rotation', '°'],
      ] as const)
        if (left[key].some((n, i) => n !== right[key][i]))
          details.push(
            `${label}: ${vector(left[key])} → ${vector(right[key])} ${unit} (X, Y, Z)`,
          );
      if (left.kind !== right.kind)
        details.push(`Shape: ${left.kind} → ${right.kind}`);
      if (left.operation !== right.operation)
        details.push(`Operation: ${left.operation} → ${right.operation}`);
      if (
        JSON.stringify(
          before.relationships?.filter((l) => l.target.featureId === id) || [],
        ) !==
        JSON.stringify(
          after.relationships?.filter((l) => l.target.featureId === id) || [],
        )
      )
        details.push('Dimension links changed');
      if (a.indexOf(left) !== b.indexOf(right))
        details.push(
          `Operation order: ${a.indexOf(left) + 1} → ${b.indexOf(right) + 1}`,
        );
    }
    return details.length
      ? [
          {
            id,
            name: right?.name ?? left!.name,
            before: left,
            after: right,
            details,
          },
        ]
      : [];
  });
}
