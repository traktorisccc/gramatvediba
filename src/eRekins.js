// Strukturēts e-rēķins: UBL 2.1, Peppol BIS Billing 3.0, EN 16931.
// Izsniedzējs nav PVN maksātājs: nodokļa kategorija "O" (darījumi, kas neietilpst PVN darbības jomā).
import { r2 } from './calc.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nauda = (x) => r2(x).toFixed(2);
const t = (tag, v, attrs = '') => (v === undefined || v === null || v === '') ? '' : `<cbc:${tag}${attrs}>${esc(v)}</cbc:${tag}>`;

function adrese(a) {
  return `<cac:PostalAddress>${t('StreetName', a.iela)}${t('CityName', a.pilseta)}${t('PostalZone', a.indekss)}<cac:Country>${t('IdentificationCode', a.valsts || 'LV')}</cac:Country></cac:PostalAddress>`;
}

function puse(p) {
  return `<cac:Party>${t('EndpointID', p.regNr, ` schemeID="${p.eas || '0218'}"`)}`
    + `<cac:PartyName>${t('Name', p.nosaukums)}</cac:PartyName>${adrese(p.adrese)}`
    + `<cac:PartyLegalEntity>${t('RegistrationName', p.nosaukums)}${t('CompanyID', p.regNr)}</cac:PartyLegalEntity>`
    + (p.epasts ? `<cac:Contact>${t('ElectronicMail', p.epasts)}</cac:Contact>` : '')
    + `</cac:Party>`;
}

const kategorijaO = `<cac:TaxCategory>${t('ID', 'O')}${t('TaxExemptionReasonCode', 'VATEX-EU-O')}${t('TaxExemptionReason', 'Rēķina izsniedzējs nav PVN maksātājs')}<cac:TaxScheme>${t('ID', 'VAT')}</cac:TaxScheme></cac:TaxCategory>`;

/**
 * r: { numurs, datums, termins, pardevejs, pircejs, ligumaNr?, atsauce?, periods?: {no, lidz}, pozicijas: [{nosaukums, daudzums, cena}], iban, bic?, piezime? }
 * pardevejs/pircejs: { nosaukums, regNr, eas?, adrese: {iela, pilseta, indekss, valsts}, epasts? }
 */
export function eRekinsXml(r) {
  const rindas = r.pozicijas.map((p, i) => ({ ...p, nr: i + 1, summa: r2(p.daudzums * p.cena) }));
  const kopa = r2(rindas.reduce((a, x) => a + x.summa, 0));
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
    + t('CustomizationID', 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0')
    + t('ProfileID', 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0')
    + t('ID', r.numurs) + t('IssueDate', r.datums) + t('DueDate', r.termins) + t('InvoiceTypeCode', '380')
    + t('Note', r.piezime || 'Rēķins sagatavots elektroniski un ir derīgs bez paraksta. Rēķina izsniedzējs nav PVN maksātājs.')
    + t('DocumentCurrencyCode', 'EUR')
    + t('BuyerReference', r.atsauce || r.ligumaNr || r.numurs)
    + (r.periods ? `<cac:InvoicePeriod>${t('StartDate', r.periods.no)}${t('EndDate', r.periods.lidz)}</cac:InvoicePeriod>` : '')
    + (r.ligumaNr ? `<cac:ContractDocumentReference>${t('ID', r.ligumaNr)}</cac:ContractDocumentReference>` : '')
    + `<cac:AccountingSupplierParty>${puse(r.pardevejs)}</cac:AccountingSupplierParty>`
    + `<cac:AccountingCustomerParty>${puse(r.pircejs)}</cac:AccountingCustomerParty>`
    + `<cac:PaymentMeans>${t('PaymentMeansCode', '58')}${t('PaymentID', r.numurs)}<cac:PayeeFinancialAccount>${t('ID', r.iban.replace(/\s/g, ''))}${t('Name', r.pardevejs.nosaukums)}`
    + (r.bic ? `<cac:FinancialInstitutionBranch>${t('ID', r.bic)}</cac:FinancialInstitutionBranch>` : '') + `</cac:PayeeFinancialAccount></cac:PaymentMeans>`
    + `<cac:TaxTotal>${t('TaxAmount', '0.00', ' currencyID="EUR"')}<cac:TaxSubtotal>${t('TaxableAmount', nauda(kopa), ' currencyID="EUR"')}${t('TaxAmount', '0.00', ' currencyID="EUR"')}${kategorijaO}</cac:TaxSubtotal></cac:TaxTotal>`
    + `<cac:LegalMonetaryTotal>${['LineExtensionAmount', 'TaxExclusiveAmount', 'TaxInclusiveAmount', 'PayableAmount'].map((k) => t(k, nauda(kopa), ' currencyID="EUR"')).join('')}</cac:LegalMonetaryTotal>`
    + rindas.map((x) => `<cac:InvoiceLine>${t('ID', x.nr)}${t('InvoicedQuantity', x.daudzums, ' unitCode="C62"')}${t('LineExtensionAmount', nauda(x.summa), ' currencyID="EUR"')}`
      + `<cac:Item>${t('Name', x.nosaukums)}<cac:ClassifiedTaxCategory>${t('ID', 'O')}<cac:TaxScheme>${t('ID', 'VAT')}</cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>`
      + `<cac:Price>${t('PriceAmount', nauda(x.cena), ' currencyID="EUR"')}</cac:Price></cac:InvoiceLine>`).join('')
    + '</Invoice>\n';
}
