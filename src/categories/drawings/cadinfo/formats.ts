/**
 * Files from CAD and design programs whose geometry can't be read without the maker's
 * software. FormatReader shows the preview picture saved inside them, what they are,
 * and which free viewer opens them.
 */
export interface CadKind {
  name: string;
  maker: string;
  /** Free (or included) ways to open it, in English / Chinese. */
  open: [string, string];
}

export const CAD_KINDS: Record<string, CadKind> = {
  skp: { name: 'SketchUp model', maker: 'Trimble SketchUp', open: ['SketchUp Viewer (free, Windows/Mac), SketchUp Free in a browser (app.sketchup.com)', 'SketchUp Viewer（免费，Windows/Mac），或浏览器中的 SketchUp Free（app.sketchup.com）'] },
  sldprt: { name: 'SolidWorks part', maker: 'Dassault Systèmes SolidWorks', open: ['eDrawings Viewer (free, Windows/Mac/phone)', 'eDrawings Viewer（免费，Windows/Mac/手机）'] },
  sldasm: { name: 'SolidWorks assembly', maker: 'Dassault Systèmes SolidWorks', open: ['eDrawings Viewer (free, Windows/Mac/phone)', 'eDrawings Viewer（免费，Windows/Mac/手机）'] },
  slddrw: { name: 'SolidWorks drawing', maker: 'Dassault Systèmes SolidWorks', open: ['eDrawings Viewer (free, Windows/Mac/phone)', 'eDrawings Viewer（免费，Windows/Mac/手机）'] },
  ipt: { name: 'Inventor part', maker: 'Autodesk Inventor', open: ['Autodesk Inventor View (free, Windows), Autodesk Viewer (viewer.autodesk.com)', 'Autodesk Inventor View（免费，Windows），Autodesk Viewer（viewer.autodesk.com）'] },
  iam: { name: 'Inventor assembly', maker: 'Autodesk Inventor', open: ['Autodesk Inventor View (free, Windows), Autodesk Viewer (viewer.autodesk.com)', 'Autodesk Inventor View（免费，Windows），Autodesk Viewer（viewer.autodesk.com）'] },
  idw: { name: 'Inventor drawing', maker: 'Autodesk Inventor', open: ['Autodesk Inventor View (free, Windows), Autodesk Viewer (viewer.autodesk.com)', 'Autodesk Inventor View（免费，Windows），Autodesk Viewer（viewer.autodesk.com）'] },
  ipn: { name: 'Inventor presentation', maker: 'Autodesk Inventor', open: ['Autodesk Inventor View (free, Windows)', 'Autodesk Inventor View（免费，Windows）'] },
  rvt: { name: 'Revit project', maker: 'Autodesk Revit', open: ['Autodesk Viewer (viewer.autodesk.com), Revit in viewer mode (free)', 'Autodesk Viewer（viewer.autodesk.com），Revit 查看模式（免费）'] },
  rfa: { name: 'Revit family', maker: 'Autodesk Revit', open: ['Autodesk Viewer (viewer.autodesk.com), Revit in viewer mode (free)', 'Autodesk Viewer（viewer.autodesk.com），Revit 查看模式（免费）'] },
  rte: { name: 'Revit template', maker: 'Autodesk Revit', open: ['Revit in viewer mode (free)', 'Revit 查看模式（免费）'] },
  rft: { name: 'Revit family template', maker: 'Autodesk Revit', open: ['Revit in viewer mode (free)', 'Revit 查看模式（免费）'] },
  '3dm': { name: 'Rhino model', maker: 'Robert McNeel & Associates', open: ['Rhino (free 90-day trial), Rhino 3dm viewers; export to STEP/OBJ to open here', 'Rhino（90 天免费试用）、3dm 查看器；导出为 STEP/OBJ 即可在这里打开'] },
  dgn: { name: 'MicroStation design', maker: 'Bentley MicroStation', open: ['Bentley View (free, Windows); export to DWG/DXF to open here', 'Bentley View（免费，Windows）；导出为 DWG/DXF 即可在这里打开'] },
  catpart: { name: 'CATIA part', maker: 'Dassault Systèmes CATIA', open: ['eDrawings (free) for some versions, 3DEXPERIENCE; export to STEP to open here', '部分版本可用 eDrawings（免费）、3DEXPERIENCE；导出为 STEP 即可在这里打开'] },
  catproduct: { name: 'CATIA assembly', maker: 'Dassault Systèmes CATIA', open: ['3DEXPERIENCE; export to STEP to open here', '3DEXPERIENCE；导出为 STEP 即可在这里打开'] },
  catdrawing: { name: 'CATIA drawing', maker: 'Dassault Systèmes CATIA', open: ['CATIA; export to PDF or DXF', 'CATIA；导出为 PDF 或 DXF'] },
  max: { name: '3ds Max scene', maker: 'Autodesk 3ds Max', open: ['Autodesk 3ds Max; export to FBX/OBJ to open here', 'Autodesk 3ds Max；导出为 FBX/OBJ 即可在这里打开'] },
  dwf: { name: 'DWF drawing (Autodesk Design Web Format)', maker: 'Autodesk — published from AutoCAD, Revit, Inventor', open: ['Autodesk Design Review (free, Windows), Autodesk Viewer (viewer.autodesk.com)', 'Autodesk Design Review（免费，Windows），Autodesk Viewer（viewer.autodesk.com）'] },
  vsd: { name: 'Visio 2003–2010 drawing', maker: 'Microsoft Visio', open: ['Visio, Visio Viewer (free, Windows), LibreOffice Draw (free); save as VSDX to open here', 'Visio、Visio Viewer（免费，Windows）、LibreOffice Draw（免费）；另存为 VSDX 即可在这里打开'] },
};
