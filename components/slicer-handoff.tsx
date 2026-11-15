const slicers = [
  ['Bambu Studio', 'https://github.com/bambulab/BambuStudio/wiki'],
  [
    'PrusaSlicer',
    'https://help.prusa3d.com/article/supported-file-formats_1772',
  ],
  ['OrcaSlicer', 'https://github.com/OrcaSlicer/OrcaSlicer/wiki/import_export'],
  ['Creality Print', 'https://wiki.creality.com/en/software/6-0/Quick-Start'],
  [
    'Cura',
    'https://ultimaker.com/learn/ultimaker-cura-5-7-stable-release-notes/',
  ],
];
export default function SlicerHandoff() {
  return (
    <details className="more">
      <summary>Slicer guides</summary>
      <p className="note">
        Import the file in your slicer. Printer, supports and filament are set
        there.
      </p>
      <div className="row">
        {slicers.map(([name, href]) => (
          <a
            key={name}
            className="quiet line"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {name}
          </a>
        ))}
      </div>
    </details>
  );
}
