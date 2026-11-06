// Darba veidi un nosacīto izdevumu normas (MK noteikumu Nr. 899 57. punkts).
// Norma ir procentos no ieņēmumiem. 0 nozīmē: nosacītos izdevumus nepiemēro.
export const DARBA_VEIDI = {
  '90.13': { nosaukums: 'Mākslas jaunrade', norma: 50, noklusejums: true },
  '90.12': { nosaukums: 'Vizuālās mākslas jaunrade', norma: 50 },
  '59.11': { nosaukums: 'Video, animācija, reklāmas klipi', norma: 50 },
  '74.12': { nosaukums: 'Grafiskais dizains', norma: 50 },
  '74.14': { nosaukums: 'Cits specializētais dizains', norma: 50 },
  'lekcija-autorligums': { nosaukums: 'Lekcija ar autorlīgumu', nace: '85.52', norma: 25, gaidaVid: true },
  'lekcija-pakalpojums': { nosaukums: 'Lekcija vai darbnīca kā pakalpojums', nace: '85.52', norma: 0, piezime: 'var ietekmēt 50 % normu pārējiem ienākumiem' },
  'bez-normas': { nosaukums: 'Bez nosacītajiem izdevumiem', norma: 0 }
};

export function norma(veids) {
  const v = DARBA_VEIDI[veids];
  if (!v) throw new Error(`Nezināms darba veids: ${veids}`);
  return v.norma;
}
