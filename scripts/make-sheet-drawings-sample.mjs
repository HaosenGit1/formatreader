// Adds a picture, a column chart, a pie chart and a text box to samples/sheets/wind-report.xlsx,
// written the way Excel stores them (drawing part + chart parts with cached values):
//   node scripts/make-sheet-drawings-sample.mjs   → samples/sheets/wind-report-charts.xlsx
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const root = join(import.meta.dirname, '..', 'samples');
const z = unzipSync(readFileSync(join(root, 'sheets', 'wind-report.xlsx')));
const EMU = 9525;

z['xl/media/image1.png'] = new Uint8Array(readFileSync(join(root, 'images', 'logo.png')));

const NS = 'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"';
const cell = (tag, col, row, dx = 0, dy = 0) => `<xdr:${tag}><xdr:col>${col}</xdr:col><xdr:colOff>${dx * EMU}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${dy * EMU}</xdr:rowOff></xdr:${tag}>`;
const chartFrame = (id, rid, name) => `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame>`;
z['xl/drawings/drawing1.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr ${NS}>
<xdr:oneCellAnchor>${cell('from', 6, 0, 4, 2)}<xdr:ext cx="${96 * EMU}" cy="${96 * EMU}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Company logo"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr/></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>
<xdr:twoCellAnchor>${cell('from', 0, 7)}${cell('to', 4, 22)}${chartFrame(3, 'rId2', 'Energy chart')}<xdr:clientData/></xdr:twoCellAnchor>
<xdr:twoCellAnchor>${cell('from', 5, 7)}${cell('to', 9, 22)}${chartFrame(4, 'rId3', 'Share chart')}<xdr:clientData/></xdr:twoCellAnchor>
<xdr:twoCellAnchor>${cell('from', 0, 23)}${cell('to', 4, 26)}<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="5" name="Note"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr/><xdr:txBody><a:bodyPr/><a:p><a:r><a:t>备注：WTG-03 十月检修 5 天。</a:t></a:r></a:p><a:p><a:r><a:t>Note: WTG-03 under maintenance for 5 days in October.</a:t></a:r></a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>
</xdr:wsDr>`);
z['xl/drawings/_rels/drawing1.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/></Relationships>`);

const strCache = (vals) => `<c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:strCache>`;
const numCache = (vals) => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache>`;
const ser = (i, name, cats, vals, color) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>x</c:f>${strCache([name])}</c:strRef></c:tx>${color ? `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr>` : ''}<c:cat><c:strRef><c:f>x</c:f>${strCache(cats)}</c:strRef></c:cat><c:val><c:numRef><c:f>x</c:f>${numCache(vals)}</c:numRef></c:val></c:ser>`;
const turbines = ['WTG-01', 'WTG-02', 'WTG-03'];
const chartDoc = (title, body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${title}</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:layout/>${body}</c:plotArea><c:legend><c:legendPos val="b"/></c:legend></c:chart></c:chartSpace>`;
z['xl/charts/chart1.xml'] = strToU8(chartDoc('发电量 Energy (MWh)', `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${ser(0, 'October', turbines, [412.6, 388.2, 0])}${ser(1, 'September', turbines, [398.1, 401.7, 120.4])}<c:axId val="1"/><c:axId val="2"/></c:barChart>`));
z['xl/charts/chart2.xml'] = strToU8(chartDoc('Share 占比', `<c:pieChart><c:varyColors val="1"/>${ser(0, 'October', turbines, [412.6, 388.2, 0.001])}</c:pieChart>`));

z['xl/worksheets/_rels/sheet1.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
z['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(z['xl/worksheets/sheet1.xml']).replace('</worksheet>', '<drawing r:id="rId9"/></worksheet>').replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ').replace(/(xmlns:r="[^"]+")(.*?)\1/, '$1$2'));
z['[Content_Types].xml'] = strToU8(strFromU8(z['[Content_Types].xml']).replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>'));

writeFileSync(join(root, 'sheets', 'wind-report-charts.xlsx'), zipSync(z));
console.log('samples/sheets/wind-report-charts.xlsx');
