// Startwerte der Kataloge. Werden nur beim allerersten Start eingespielt –
// danach werden sie in der App unter "Kataloge" gepflegt.
// Einträge: 'Text' (Schlüssel wird erzeugt) oder ['schluessel', 'Text'].
// Abhängige Kataloge (REGION): { ELTERNSCHLUESSEL: [...] }

export const SEED = {
  ART: [
    'Höhenburg', 'Spornburg', 'Gipfelburg', 'Hangburg', 'Felsenburg', 'Höhlenburg',
    'Niederungsburg', 'Wasserburg', 'Motte', 'Turmburg', 'Stadtburg', 'Ordensburg',
    'Burgstall', 'Schloss', 'Festung',
  ],
  ZUSTAND: [
    'Vollständig erhalten', 'Teilweise erhalten', 'Ruine', 'Mauerreste',
    'Bodendenkmal / Burgstall', 'Verschwunden', 'Rekonstruiert',
  ],
  BAUTEIL: [
    'Bergfried', 'Palas', 'Ringmauer', 'Schildmauer', 'Zwinger', 'Torhaus', 'Halsgraben',
    'Wassergraben', 'Kapelle', 'Wohnturm', 'Vorburg', 'Brunnen / Zisterne', 'Wehrgang', 'Rondell / Bastion',
  ],
  MATERIAL: ['Bruchstein', 'Quader', 'Buckelquader', 'Backstein', 'Fachwerk', 'Holz / Erde'],
  STAND: [
    'Hochadel', 'Niederadel / Ministerialen', 'Reichsburg', 'Landesherrlich',
    'Bischof / Kloster', 'Ritterorden', 'Stadt',
  ],
  LAND: [
    ['DE', 'Deutschland'], ['AT', 'Österreich'], ['CH', 'Schweiz'], ['IT', 'Italien'],
    ['FR', 'Frankreich'], ['LU', 'Luxemburg'], ['BE', 'Belgien'], ['NL', 'Niederlande'],
    ['CZ', 'Tschechien'], ['PL', 'Polen'], ['DK', 'Dänemark'], ['LI', 'Liechtenstein'],
    ['SI', 'Slowenien'], ['HU', 'Ungarn'], ['ES', 'Spanien'], ['GB', 'Vereinigtes Königreich'],
  ],
  REGION: {
    DE: [
      ['DE-BW', 'Baden-Württemberg'], ['DE-BY', 'Bayern'], ['DE-BE', 'Berlin'], ['DE-BB', 'Brandenburg'],
      ['DE-HB', 'Bremen'], ['DE-HH', 'Hamburg'], ['DE-HE', 'Hessen'], ['DE-MV', 'Mecklenburg-Vorpommern'],
      ['DE-NI', 'Niedersachsen'], ['DE-NW', 'Nordrhein-Westfalen'], ['DE-RP', 'Rheinland-Pfalz'],
      ['DE-SL', 'Saarland'], ['DE-SN', 'Sachsen'], ['DE-ST', 'Sachsen-Anhalt'],
      ['DE-SH', 'Schleswig-Holstein'], ['DE-TH', 'Thüringen'],
    ],
    AT: [
      ['AT-1', 'Burgenland'], ['AT-2', 'Kärnten'], ['AT-3', 'Niederösterreich'], ['AT-4', 'Oberösterreich'],
      ['AT-5', 'Salzburg'], ['AT-6', 'Steiermark'], ['AT-7', 'Tirol'], ['AT-8', 'Vorarlberg'], ['AT-9', 'Wien'],
    ],
    CH: [
      ['CH-AG', 'Aargau'], ['CH-AI', 'Appenzell Innerrhoden'], ['CH-AR', 'Appenzell Ausserrhoden'],
      ['CH-BE', 'Bern'], ['CH-BL', 'Basel-Landschaft'], ['CH-BS', 'Basel-Stadt'], ['CH-FR', 'Freiburg'],
      ['CH-GE', 'Genf'], ['CH-GL', 'Glarus'], ['CH-GR', 'Graubünden'], ['CH-JU', 'Jura'], ['CH-LU', 'Luzern'],
      ['CH-NE', 'Neuenburg'], ['CH-NW', 'Nidwalden'], ['CH-OW', 'Obwalden'], ['CH-SG', 'St. Gallen'],
      ['CH-SH', 'Schaffhausen'], ['CH-SO', 'Solothurn'], ['CH-SZ', 'Schwyz'], ['CH-TG', 'Thurgau'],
      ['CH-TI', 'Tessin'], ['CH-UR', 'Uri'], ['CH-VD', 'Waadt'], ['CH-VS', 'Wallis'], ['CH-ZG', 'Zug'],
      ['CH-ZH', 'Zürich'],
    ],
    IT: [['IT-BZ', 'Südtirol'], ['IT-TN', 'Trentino']],
    FR: [['FR-GES', 'Grand Est (Elsass, Lothringen)']],
  },
  JAHRHUNDERT: [
    ['jh09', '9. Jh.'], ['jh10', '10. Jh.'], ['jh11', '11. Jh.'], ['jh12', '12. Jh.'], ['jh13', '13. Jh.'],
    ['jh14', '14. Jh.'], ['jh15', '15. Jh.'], ['jh16', '16. Jh.'], ['jh17', '17. Jh.'], ['jh18', '18. Jh.'],
    ['jh19', '19. Jh.'],
  ],
  ZERSTOERUNG: ['Krieg / Belagerung', 'Brand', 'Abriss / Steinraub', 'Verfall', 'Naturereignis', 'Unbekannt'],
  EIGENTUEMER: ['Privat', 'Bund / Land', 'Gemeinde', 'Verein', 'Stiftung', 'Kirche', 'Unbekannt'],
  NUTZUNG: ['Museum', 'Gastronomie', 'Hotel', 'Wohnsitz', 'Veranstaltungen', 'Jugendherberge', 'Ungenutzt'],
  ZUGANG: ['Frei zugänglich', 'Gegen Eintritt', 'Nur mit Führung', 'Eingeschränkt', 'Nicht zugänglich'],
  KOORDQUELLE: [['gps', 'GPS vor Ort'], ['foto', 'Foto (EXIF)'], ['karte', 'Karte manuell'], ['literatur', 'Literatur / Internet']],
}

export function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'wert'
}

export function seedEntries() {
  const out = []
  const push = (katalog, list, parent = '') => {
    list.forEach((item, i) => {
      const [schluessel, wert] = Array.isArray(item) ? item : [slug(item), item]
      out.push({ katalog, schluessel, wert, sort: (i + 1) * 10, aktiv: true, parent })
    })
  }
  for (const [katalog, list] of Object.entries(SEED)) {
    if (Array.isArray(list)) push(katalog, list)
    else for (const [parent, sub] of Object.entries(list)) push(katalog, sub, parent)
  }
  return out
}
