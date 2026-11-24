// QGIS-Stil (QML) und QGIS-Projekt (.qgs) für den GeoPackage-Export.
// Der Stil wird im GeoPackage als Standardstil (Tabelle layer_styles) abgelegt –
// QGIS übernimmt ihn automatisch, sobald die Ebene geladen wird: Beschriftung, Symbol,
// deutsche Feldnamen, Formular mit Reitern, Auswahllisten und Bildanzeige.
import { SECTIONS, GEO_FIELDS } from '../fields.js'

export const QGIS_VERSION = '3.40.0'
export const EBENE = 'burgen'

const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const opt = (name, type, value) => `<Option name="${x(name)}" type="${type}" value="${x(value)}"/>`

// Wurzelordner für relative Bildpfade = Ordner, in dem das GeoPackage liegt
export const ROOT_AUSDRUCK = "file_path(layer_property(@layer, 'path'))"

// Abschnitte des Formulars (Reiter) mit den Spalten des GeoPackage
export function formularAbschnitte() {
  return SECTIONS.map((s) => {
    if (s.special === 'geo') return { title: s.title, fields: GEO_FIELDS }
    if (s.special === 'bilder') {
      const f = []
      for (let i = 1; i <= 4; i++) {
        f.push({ key: `bild${i}`, label: `Bild ${i}`, type: 'bild' })
        f.push({ key: `bild${i}_text`, label: `Bildunterschrift ${i}`, type: 'text' })
      }
      return { title: s.title, fields: f }
    }
    return { title: s.title, fields: s.fields }
  }).concat([{ title: 'Verwaltung', fields: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'erstellt', label: 'Erstellt', type: 'text' },
    { key: 'geaendert', label: 'Geändert', type: 'text' },
  ] }])
}

function widget(f, kataloge) {
  if (f.type === 'bild') {
    return `<editWidget type="ExternalResource"><config><Option type="Map">
${opt('DocumentViewer', 'int', 1)}${opt('DocumentViewerHeight', 'int', 320)}${opt('DocumentViewerWidth', 'int', 0)}
${opt('FileWidget', 'bool', 'true')}${opt('FileWidgetButton', 'bool', 'true')}${opt('FileWidgetFilter', 'QString', 'Bilder (*.jpg *.jpeg *.png)')}${opt('FullUrl', 'bool', 'false')}
<Option name="PropertyCollection" type="Map">${opt('name', 'QString', '')}<Option name="properties" type="Map"><Option name="propertyRootPath" type="Map">${opt('active', 'bool', 'true')}${opt('expression', 'QString', ROOT_AUSDRUCK)}${opt('type', 'int', 3)}</Option></Option>${opt('type', 'QString', 'collection')}</Option>
${opt('RelativeStorage', 'int', 2)}${opt('StorageMode', 'int', 0)}${opt('UseLink', 'bool', 'true')}
</Option></config></editWidget>`
  }
  if ((f.type === 'kat' || f.type === 'status') && kataloge[f.katalog || 'STATUS']?.length) {
    const werte = kataloge[f.katalog || 'STATUS']
    return `<editWidget type="ValueMap"><config><Option type="Map"><Option name="map" type="List">
${werte.map((w) => `<Option type="Map">${opt(w, 'QString', w)}</Option>`).join('')}
</Option></Option></config></editWidget>`
  }
  if (f.type === 'textarea') {
    return `<editWidget type="TextEdit"><config><Option type="Map">${opt('IsMultiline', 'bool', 'true')}${opt('UseHtml', 'bool', 'false')}</Option></config></editWidget>`
  }
  if (f.type === 'rating') {
    return `<editWidget type="Range"><config><Option type="Map">${opt('AllowNull', 'bool', 'true')}${opt('Max', 'int', 5)}${opt('Min', 'int', 0)}${opt('Precision', 'int', 0)}${opt('Step', 'int', 1)}${opt('Style', 'QString', 'SpinBox')}</Option></config></editWidget>`
  }
  if (f.type === 'date') {
    return `<editWidget type="DateTime"><config><Option type="Map">${opt('allow_null', 'bool', 'true')}${opt('calendar_popup', 'bool', 'true')}${opt('display_format', 'QString', 'dd.MM.yyyy')}${opt('field_format', 'QString', 'yyyy-MM-dd')}${opt('field_iso_format', 'bool', 'false')}</Option></config></editWidget>`
  }
  return `<editWidget type="TextEdit"><config><Option type="Map">${opt('IsMultiline', 'bool', 'false')}${opt('UseHtml', 'bool', 'false')}</Option></config></editWidget>`
}

const KARTENTIPP = `<div style="max-width:320px">
<b style="font-size:13pt">[% "name" %]</b><br>
[% concat_ws(' · ', "art", "zustand") %]<br>
<span style="color:#666">[% concat_ws(', ', "gemeinde", "region", "land") %]</span>
[% CASE WHEN "bild1" IS NOT NULL THEN '<br><img src="file:///' || replace(${ROOT_AUSDRUCK}, '\\\\', '/') || '/' || "bild1" || '" width="300">' END %]
</div>`

// Innerer Teil des Stils – wird sowohl als QML als auch im Projekt verwendet
export function stilInhalt(spalten, kataloge) {
  const abschnitte = formularAbschnitte()
  const index = new Map(spalten.map((k, i) => [k, i + 1])) // Spalte 0 = fid
  const alle = abschnitte.flatMap((a) => a.fields)

  const renderer = `<renderer-v2 type="singleSymbol" symbollevels="0" enableorderby="0" forceraster="0" referencescale="-1">
<symbols><symbol type="marker" name="0" alpha="1" clip_to_extent="1" force_rhr="0">
<layer class="SimpleMarker" enabled="1" locked="0" pass="0"><Option type="Map">
${opt('angle', 'QString', '0')}${opt('color', 'QString', '122,46,29,255')}${opt('joinstyle', 'QString', 'miter')}${opt('name', 'QString', 'square')}
${opt('outline_color', 'QString', '255,255,255,255')}${opt('outline_style', 'QString', 'solid')}${opt('outline_width', 'QString', '0.5')}${opt('outline_width_unit', 'QString', 'MM')}
${opt('size', 'QString', '3.4')}${opt('size_unit', 'QString', 'MM')}${opt('vertical_anchor_point', 'QString', '1')}
</Option></layer></symbol></symbols><rotation/><sizescale/></renderer-v2>`

  const beschriftung = `<labeling type="simple"><settings calloutType="simple">
<text-style fieldName="name" isExpression="0" fontFamily="Arial" fontSize="9" fontSizeUnit="Point" fontWeight="700" textColor="60,25,15,255" textOpacity="1" multilineHeight="1" allowHtml="0">
<families/>
<text-buffer bufferDraw="1" bufferSize="1" bufferSizeUnits="MM" bufferColor="255,255,255,255" bufferOpacity="0.9" bufferNoFill="1" bufferJoinStyle="128" bufferBlendMode="0"/>
</text-style>
<text-format wrapChar="" autoWrapLength="18" useMaxLineLengthForAutoWrap="1" multilineAlign="3"/>
<placement placement="6" dist="1.2" distUnits="MM" predefinedPositionOrder="TR,TL,BR,BL,R,L,TSR,BSR" overlapHandling="PreventOverlap" priority="5" offsetType="0"/>
<rendering drawLabels="1" obstacle="1" obstacleFactor="1" obstacleType="1" scaleVisibility="0" limitNumLabels="0" maxNumLabels="2000" upsidedownLabels="0" zIndex="0"/>
</settings></labeling>`

  const felder = spalten
    .map((k) => {
      const f = alle.find((a) => a.key === k) || { key: k, type: 'text' }
      return `<field name="${x(k)}" configurationFlags="NoFlag">${widget(f, kataloge)}</field>`
    })
    .join('\n')

  const aliase = spalten.map((k, i) => `<alias field="${x(k)}" index="${i + 1}" name="${x(alle.find((a) => a.key === k)?.label || '')}"/>`).join('\n')

  const formular = abschnitte
    .map((a) => {
      const inhalt = a.fields
        .filter((f) => index.has(f.key))
        .map((f) => `<attributeEditorField name="${x(f.key)}" index="${index.get(f.key)}" showLabel="1"/>`)
        .join('')
      return `<attributeEditorContainer name="${x(a.title)}" type="Tab" groupBox="0" columnCount="1" showLabel="1" visibilityExpressionEnabled="0" visibilityExpression="">${inhalt}</attributeEditorContainer>`
    })
    .join('\n')

  return `<flags><Identifiable>1</Identifiable><Removable>1</Removable><Searchable>1</Searchable></flags>
${renderer}
${beschriftung}
<fieldConfiguration>
<field name="fid" configurationFlags="HideFromWfs"><editWidget type="Hidden"><config><Option/></config></editWidget></field>
${felder}
</fieldConfiguration>
<aliases>
<alias field="fid" index="0" name=""/>
${aliase}
</aliases>
<editform tolerant="1"></editform>
<editforminit/>
<editforminitcodesource>0</editforminitcodesource>
<featformsuppress>0</featformsuppress>
<editorlayout>tablayout</editorlayout>
<attributeEditorForm>
${formular}
</attributeEditorForm>
<previewExpression>"name"</previewExpression>
<mapTip enabled="1">${x(KARTENTIPP)}</mapTip>
<layerGeometryType>0</layerGeometryType>`
}

export function qml(spalten, kataloge) {
  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="${QGIS_VERSION}" styleCategories="AllStyleCategories" labelsEnabled="1" hasScaleBasedVisibilityFlag="0" readOnly="0">
${stilInhalt(spalten, kataloge)}
</qgis>
`
}

// Web-Mercator-Ausdehnung der Burgen (für die Startansicht des Projekts)
function mercator([lon, lat]) {
  const R = 6378137
  const y = Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) * R
  return [(lon * Math.PI * R) / 180, y]
}

export function projekt({ gpkgName, spalten, kataloge, punkte }) {
  let ext
  if (punkte.length) {
    const m = punkte.map(mercator)
    const xs = m.map((p) => p[0])
    const ys = m.map((p) => p[1])
    const rand = Math.max(3000, (Math.max(...xs) - Math.min(...xs)) * 0.1, (Math.max(...ys) - Math.min(...ys)) * 0.1)
    ext = [Math.min(...xs) - rand, Math.min(...ys) - rand, Math.max(...xs) + rand, Math.max(...ys) + rand]
  } else {
    ext = [500000, 5900000, 1700000, 7400000] // Mitteleuropa
  }
  const crs = (auth, srid, proj) =>
    `<spatialrefsys><authid>${auth}</authid><srid>${srid}</srid><proj4>${proj}</proj4></spatialrefsys>`
  const C3857 = crs('EPSG:3857', 3857, '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs')
  const C4326 = crs('EPSG:4326', 4326, '+proj=longlat +datum=WGS84 +no_defs')
  const quelle = `./${gpkgName}|layername=${EBENE}`
  const osm = 'type=xyz&url=https://tile.openstreetmap.org/{z}/{x}/{y}.png&zmax=19&zmin=0&crs=EPSG3857'
  const extent = `<extent><xmin>${ext[0]}</xmin><ymin>${ext[1]}</ymin><xmax>${ext[2]}</xmax><ymax>${ext[3]}</ymax></extent>`

  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis projectname="Burgen" version="${QGIS_VERSION}">
<title>Burgen</title>
<projectCrs>${C3857}</projectCrs>
<layer-tree-group>
<customproperties/>
<layer-tree-layer id="burgen_ebene" name="Burgen" source="${x(quelle)}" providerKey="ogr" checked="Qt::Checked" expanded="1"><customproperties/></layer-tree-layer>
<layer-tree-layer id="osm_ebene" name="OpenStreetMap" source="${x(osm)}" providerKey="wms" checked="Qt::Checked" expanded="0"><customproperties/></layer-tree-layer>
</layer-tree-group>
<mapcanvas name="theMapCanvas" annotationsVisible="1"><units>meters</units>${extent}<rotation>0</rotation><destinationsrs>${C3857}</destinationsrs><rendermaptile>0</rendermaptile></mapcanvas>
<projectlayers>
<maplayer type="vector" geometry="Point" wkbType="Point" labelsEnabled="1" autoRefreshMode="Disabled" hasScaleBasedVisibilityFlag="0" readOnly="0">
<id>burgen_ebene</id>
<datasource>${x(quelle)}</datasource>
<layername>Burgen</layername>
<srs>${C4326}</srs>
<provider encoding="UTF-8">ogr</provider>
${stilInhalt(spalten, kataloge)}
</maplayer>
<maplayer type="raster" autoRefreshMode="Disabled" hasScaleBasedVisibilityFlag="0">
<id>osm_ebene</id>
<datasource>${x(osm)}</datasource>
<layername>OpenStreetMap</layername>
<srs>${C3857}</srs>
<provider>wms</provider>
<noData/>
<pipe><rasterrenderer type="singlebandcolordata" band="1" opacity="1" alphaBand="-1"><rasterTransparency/></rasterrenderer><brightnesscontrast brightness="0" contrast="0" gamma="1"/><huesaturation saturation="0" grayscaleMode="0"/><rasterresampler maxOversampling="2"/></pipe>
<blendMode>0</blendMode>
</maplayer>
</projectlayers>
<layerorder><layer id="burgen_ebene"/><layer id="osm_ebene"/></layerorder>
<properties>
<Paths><Absolute type="bool">false</Absolute></Paths>
<Measurement><DistanceUnits type="QString">meters</DistanceUnits><AreaUnits type="QString">m2</AreaUnits></Measurement>
</properties>
</qgis>
`
}
