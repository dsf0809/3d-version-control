export default function SlicerHandoff() {
  return (
    <details className="change-explanations">
      <summary>Open in your slicer</summary>
      <ol>
        <li>Select an accepted revision and download 3MF (or STL).</li>
        <li>
          Open your slicer, select your printer and nozzle, then import the
          file. If prompted, choose geometry/model only.
        </li>
        <li>
          Check dimensions, place the model on the plate, choose filament and
          print settings, then slice and inspect the layer preview.
        </li>
        <li>
          Send to your printer or export the sliced file using the slicer’s
          normal workflow.
        </li>
      </ol>
      <p>
        3MF contains the solid model, millimeter units and Form’s display color.
        It does not contain printer profiles, supports, AMS assignments or
        G-code. The slicer may use its filament color instead.
      </p>
      <ul>
        <li>
          <a
            href="https://github.com/bambulab/BambuStudio/wiki"
            target="_blank"
            rel="noreferrer"
          >
            Bambu Studio
          </a>
          : import the model, then use your configured Bambu printer.
        </li>
        <li>
          <a
            href="https://help.prusa3d.com/article/supported-file-formats_1772"
            target="_blank"
            rel="noreferrer"
          >
            PrusaSlicer
          </a>
          : add the 3MF model to the plate.
        </li>
        <li>
          <a
            href="https://github.com/OrcaSlicer/OrcaSlicer/wiki/import_export"
            target="_blank"
            rel="noreferrer"
          >
            OrcaSlicer
          </a>
          : import 3MF geometry into your printer project.
        </li>
        <li>
          <a
            href="https://wiki.creality.com/en/software/6-0/Quick-Start"
            target="_blank"
            rel="noreferrer"
          >
            Creality Print
          </a>
          : open 3MF; use STL import if your version rejects it.
        </li>
        <li>
          <a
            href="https://ultimaker.com/learn/ultimaker-cura-5-7-stable-release-notes/"
            target="_blank"
            rel="noreferrer"
          >
            UltiMaker Cura
          </a>
          : open the 3MF as a model; STL is the fallback (interpret as mm).
        </li>
      </ul>
      <p>
        This downloads a file for import; it does not launch a slicer or start a
        print.
      </p>
    </details>
  );
}
