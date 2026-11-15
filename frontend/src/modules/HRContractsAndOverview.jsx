import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Check, X, Upload, Download, Plus, Trash2, Edit3, Eye, Printer,
  AlertTriangle, ShieldCheck, Calendar, Clock, Users, Euro, Car, Briefcase,
  GraduationCap, Lock, Unlock, Search, ArrowRight, RefreshCw, Sparkles, CheckCircle2,
  Mail, Smartphone, Copy, Send
} from 'lucide-react';
import { fetchWithToken, uploadMediaFile, resolveMediaUrl, formatDate, formatEuro } from '../core/api';
import { DateInput } from '../components/DateTimeInputs';
import { downloadCsv } from '../components/ui';
import html2pdf from 'html2pdf.js';

// ==============================================================================
// 5 OFFICIAL BRÜNEL DEUTSCHLAND UG CONTRACT MODULES
// 1. Arbeitsvertrag + Anlage 1 (Vertraulichkeitsvereinbarung / NDA)
// 2. Kfz-Übergabeprotokoll und Nutzungsvereinbarung
// 3. Vertrag über ein unbezahltes Orientierungspraktikum (Einfühlungsverhältnis)
// 4. Subunternehmervertrag (Werkvertrag) + Ausführungsrichtlinien + Sicherheitsblatt
// 5. DSGVO-Datenschutzerklärung & Verpflichtung auf das Datengeheimnis (PFLICHTMODUL)
// ==============================================================================

export const CONTRACT_CATALOG = [
  {
    code: 'ARBEITSVERTRAG',
    title: 'Arbeitsvertrag + Anlage 1 (Vertraulichkeitsvereinbarung)',
    shortLabel: '1. Arbeitsvertrag + NDA',
    subtitle: 'Unbefristeter Arbeitsvertrag (§1–§11) inkl. Anlage 1 Vertraulichkeitsvereinbarung (§1–§6)',
    pages: 6,
    icon: Briefcase,
    color: '#0f172a',
    bg: '#f8fafc',
    border: '#cbd5e1',
    mandatory: false,
  },
  {
    code: 'KFZ_UEBERGABE',
    title: 'Kfz-Übergabeprotokoll und Nutzungsvereinbarung',
    shortLabel: '2. Kfz-Übergabeprotokoll',
    subtitle: 'Dienstfahrzeug-Übergabe, Fahrzeugdaten, Zubehör, Führerschein & Nutzungsbedingungen (§1–§7)',
    pages: 3,
    icon: Car,
    color: '#1d4ed8',
    bg: '#eff6ff',
    border: '#bfdbfe',
    mandatory: false,
  },
  {
    code: 'PRAKTIKUM',
    title: 'Vertrag über ein unbezahltes Orientierungspraktikum (Einfühlungsverhältnis)',
    shortLabel: '3. Orientierungspraktikum',
    subtitle: 'Einfühlungsverhältnis gem. § 22 Abs. 1 Nr. 2 MiLoG ohne Arbeitsverhältnis (§1–§5)',
    pages: 2,
    icon: GraduationCap,
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    mandatory: false,
  },
  {
    code: 'SUBUNTERNEHMER',
    title: 'Subunternehmervertrag (Werkvertrag) inkl. Ausführungsrichtlinien & Sicherheitsblatt',
    shortLabel: '4. Subunternehmervertrag (Werkvertrag)',
    subtitle: 'NE4 Inhouse-Glasfaserausbau Werkvertrag (§1–§6) + Ausführungsrichtlinien + Arbeitsschutzrichtlinie',
    pages: 7,
    icon: ShieldCheck,
    color: '#c2410c',
    bg: '#fff7ed',
    border: '#fed7aa',
    mandatory: false,
  },
  {
    code: 'DSGVO',
    title: 'DSGVO-Datenschutzerklärung & Verpflichtung auf das Datengeheimnis',
    shortLabel: '5. DSGVO-Datenschutzerklärung (Pflicht)',
    subtitle: 'Pflichtdokument gem. Art. 13, 14, 29, 32 DSGVO & §§ 26, 53 BDSG — wird jedem Vertrag beigefügt',
    pages: 3,
    icon: Lock,
    color: '#047857',
    bg: '#ecfdf5',
    border: '#6ee7b7',
    mandatory: true,
  },
];

const fmtDeDate = (iso) => {
  if (!iso) return '....................';
  const s = String(iso).slice(0, 10);
  const parts = s.split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return iso;
};

const fmtDeCurrency = (val) => {
  const num = Number(val || 0);
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const addMonthsIso = (isoDate, months = 6) => {
  if (!isoDate) return '';
  const d = new Date(`${String(isoDate).slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + Number(months || 6));
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const renderPageHeader = () => `
  <div class="brn-doc-header" style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:18px;padding-bottom:8px;">
    <img src="/bruenel-dark.svg" alt="Brünel" style="height:28px;object-fit:contain;" onerror="this.style.display='none'" />
  </div>
`;

const renderPageFooter = (pageLabel = '') => `
  <div class="brn-doc-footer" style="display:flex;justify-content:space-between;align-items:center;margin-top:28px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:9pt;color:#64748b;">
    <span>${pageLabel}</span>
    <span style="font-weight:700;color:#475569;">bruenel.de</span>
  </div>
`;

export function generateContractHtml(code, emp, cond) {
  const fullName = `${cond.first_name || emp?.first_name || ''} ${cond.last_name || emp?.last_name || ''}`.trim() || 'Name des Mitarbeiters';
  const salutation = cond.salutation || emp?.attributes?.salutation || emp?.attributes?.anrede || 'Herr';
  const street = cond.street || emp?.attributes?.street || emp?.attributes?.strasse || 'Straße & Hausnummer';
  const postalCode = cond.postal_code || emp?.attributes?.postal_code || emp?.attributes?.plz || 'PLZ';
  const city = cond.city || emp?.attributes?.city || emp?.attributes?.ort || 'Ort';
  const fullAddress = `${street}, ${postalCode} ${city}`.trim();
  const birthDate = fmtDeDate(cond.birth_date || emp?.attributes?.birth_date || emp?.attributes?.geburtsdatum || '');
  const roleTitle = cond.role || emp?.role || 'Projektleiter / Field Technician';
  const startDate = fmtDeDate(cond.contract_start_date);
  const probezeitMonths = Number(cond.probezeit_months ?? 6);
  const probezeitEnd = fmtDeDate(cond.probezeit_end_date);
  const signedDate = fmtDeDate(cond.signed_date);
  const weeklyHours = cond.weekly_hours ?? 40;
  const grossSalary = fmtDeCurrency(cond.base_salary ?? 3600);
  const statutoryLeave = Number(cond.statutory_leave_days ?? 20);
  const extraLeave = Number(cond.extra_leave_days ?? 4);
  const totalLeave = statutoryLeave + extraLeave;
  const praktikumStart = fmtDeDate(cond.praktikum_start_date);
  const praktikumEnd = fmtDeDate(cond.praktikum_end_date);
  const companyName = cond.company_name || emp?.attributes?.company_name || fullName;

  const partyLineAccusative =
    salutation === 'Frau'
      ? `Frau <strong>${fullName}</strong>`
      : salutation === 'Firma'
        ? `Firma <strong>${companyName}</strong>${companyName !== fullName ? ` (vertreten durch ${fullName})` : ''}`
        : `Herrn <strong>${fullName}</strong>`;

  const partyLineSubunternehmer =
    salutation === 'Firma'
      ? `Firma: <strong>${companyName}</strong>${companyName !== fullName ? ` (vertreten durch ${fullName})` : ''}`
      : salutation === 'Frau'
        ? `Frau <strong>${companyName}</strong>`
        : `Herrn <strong>${companyName}</strong>`;

  const partyLineDsgvo =
    salutation === 'Firma'
      ? `Firma <strong>${companyName}</strong> (${fullName}${birthDate && birthDate !== '....................' ? `, geb. am ${birthDate}` : ''})`
      : salutation === 'Frau'
        ? `Frau <strong>${fullName}</strong>${birthDate && birthDate !== '....................' ? ` (geb. am ${birthDate})` : ''}`
        : `Herrn <strong>${fullName}</strong>${birthDate && birthDate !== '....................' ? ` (geb. am ${birthDate})` : ''}`;

  const partySignatureLabel =
    salutation === 'Frau'
      ? `Frau ${fullName}`
      : salutation === 'Firma'
        ? `Firma ${companyName}${companyName !== fullName ? ` (${fullName})` : ''}`
        : `Herr ${fullName}`;

  if (code === 'ARBEITSVERTRAG') {
    return `
      <div class="brn-contract-sheet">
        ${renderPageHeader()}
        <h1 style="font-size:18pt;font-weight:800;margin:0 0 18px 0;color:#111827;">Arbeitsvertrag</h1>
        <p style="margin:0 0 8px 0;">Zwischen</p>
        <p style="margin:0 0 4px 0;"><strong>Brünel Deutschland UG (haftungsbeschränkt)</strong></p>
        <p style="margin:0 0 4px 0;">Ramonville Str. 28, 61184 Karben</p>
        <p style="margin:0 0 4px 0;">vertreten durch den Geschäftsführer Herrn Sam Rastegar Moghadam</p>
        <p style="margin:0 0 14px 0;color:#374151;">– nachfolgend „Arbeitgeber“ genannt –</p>
        <p style="margin:0 0 8px 0;">und</p>
        <p style="margin:0 0 4px 0;">${partyLineAccusative}</p>
        <p style="margin:0 0 4px 0;">wohnhaft in: <strong>${fullAddress}</strong></p>
        <p style="margin:0 0 16px 0;color:#374151;">– nachfolgend „Arbeitnehmer“ genannt –</p>
        <p style="margin:0 0 18px 0;">wird folgender Arbeitsvertrag geschlossen:</p>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 6px 0;">§ 1 Beginn und Dauer des Arbeitsverhältnisses</h3>
        <p style="margin:0 0 12px 0;text-align:justify;">
          Das Arbeitsverhältnis beginnt am <strong>${startDate}</strong> und wird auf unbestimmte Zeit (unbefristet) geschlossen.
        </p>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 6px 0;">§ 2 Probezeit und Kündigung</h3>
        <ol style="margin:0 0 12px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Die ersten <strong>${probezeitMonths} Monate</strong> (bis zum <strong>${probezeitEnd}</strong>) gelten als Probezeit. Während der Probezeit kann das Arbeitsverhältnis von beiden Seiten mit einer Frist von zwei Wochen zu jedem beliebigen Tag gekündigt werden (§ 622 Abs. 3 BGB).</li>
          <li style="margin-bottom:6px;">Nach Ablauf der Probezeit gilt eine Kündigungsfrist von vier Wochen zum Fünfzehnten oder zum Ende eines Kalendermonats. Verlängert sich die Kündigungsfrist für den Arbeitgeber aus tariflichen oder gesetzlichen Gründen (insb. § 622 Abs. 2 BGB), gilt diese verlängerte Frist in gleicher Weise auch für eine Kündigung durch den Arbeitnehmer (Gleichstellungsklausel).</li>
          <li style="margin-bottom:6px;">Jede Kündigung bedarf zu ihrer Wirksamkeit der Schriftform; die elektronische Form ist ausgeschlossen.</li>
          <li style="margin-bottom:6px;">Der Arbeitgeber ist berechtigt, den Arbeitnehmer nach Ausspruch einer Kündigung unter Fortzahlung der Vergütung und unter Anrechnung auf etwaige Urlaubs- und Freizeitausgleichsansprüche widerruflich oder unwiderruflich von der Arbeitsleistung freizustellen.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 6px 0;">§ 3 Tätigkeit, Versetzungsvorbehalt und Reisebereitschaft</h3>
        <ol style="margin:0 0 12px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Der Arbeitnehmer wird als <strong>„${roleTitle}“</strong> eingestellt. Zu seinen Aufgaben gehören insbesondere die Planung, Steuerung, Koordination und Überwachung von IT- und Infrastrukturprojekten sowie die Führung von Projektteams und die Kommunikation mit Auftraggebern und Nachunternehmern.</li>
          <li style="margin-bottom:6px;">Der Arbeitgeber behält sich vor, dem Arbeitnehmer innerhalb des Unternehmens eine andere, seinen Vorkenntnissen und Fähigkeiten entsprechende, gleichwertige und zumutbare Tätigkeit zuzuweisen.</li>
          <li style="margin-bottom:6px;">Aufgrund der Natur der Projektarbeit hat der Arbeitnehmer keinen festen, ausschließlichen Arbeitsort. Er erklärt sich ausdrücklich bereit, im Rahmen seiner Tätigkeit <strong>deutschlandweit</strong> Dienstreisen zu unternehmen und vor Ort auf den jeweiligen Projektbaustellen bzw. bei Kunden tätig zu sein.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 6px 0;">§ 4 Arbeitszeit</h3>
        <ol style="margin:0 0 12px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Die regelmäßige wöchentliche Arbeitszeit beträgt <strong>${weeklyHours} Stunden</strong> (ohne Pausen).</li>
          <li style="margin-bottom:6px;">Die Verteilung der Arbeitszeit sowie Beginn und Ende der täglichen Arbeitszeit und der Pausen richten sich nach den betrieblichen Erfordernissen und den Anforderungen der jeweiligen Projekte.</li>
          <li style="margin-bottom:6px;">Der Arbeitnehmer ist verpflichtet, bei betrieblichem Bedarf im gesetzlich zulässigen Rahmen (Arbeitszeitgesetz) Überstunden und Mehrarbeit zu leisten.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 6px 0;">§ 5 Vergütung und Überstunden</h3>
        <ol style="margin:0 0 12px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Der Arbeitnehmer erhält ein monatliches Bruttogehalt in Höhe von <strong>${grossSalary} EUR</strong>.</li>
          <li style="margin-bottom:6px;">Die Vergütung ist jeweils am <strong>15. des Folgemonats</strong> fällig und wird bargeldlos auf das vom Arbeitnehmer benannte Konto überwiesen.</li>
          <li style="margin-bottom:6px;">Überstunden werden nur berücksichtigt, wenn sie vom Arbeitgeber zuvor ausdrücklich angeordnet oder nachträglich genehmigt wurden. Geleistete und genehmigte Überstunden werden nach Wahl des Arbeitgebers entweder durch bezahlten Freizeitausgleich oder durch gesonderte Vergütung (berechnet auf Basis des individuellen Stundenlohns) abgegolten.</li>
          <li style="margin-bottom:6px;">Die Gewährung von sonstigen Leistungen (z.B. Boni, Prämien, Weihnachtsgeld) erfolgt stets freiwillig und mit der Maßgabe, dass auch bei wiederholter Zahlung kein Rechtsanspruch für die Zukunft begründet wird (Freiwilligkeitsvorbehalt).</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 6px 0;">§ 6 Urlaub</h3>
        <ol style="margin:0 0 12px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Der Arbeitnehmer hat bei einer 5-Tage-Woche Anspruch auf einen gesetzlichen Mindesturlaub von <strong>${statutoryLeave} Arbeitstagen</strong> pro Kalenderjahr.</li>
          <li style="margin-bottom:6px;">Darüber hinaus gewährt der Arbeitgeber einen vertraglichen Zusatzurlaub von <strong>${extraLeave} Arbeitstagen</strong>. Somit beträgt der Gesamturlaubsanspruch insgesamt <strong>${totalLeave} Arbeitstage</strong> Urlaub pro Kalenderjahr.</li>
          <li style="margin-bottom:6px;">Bei Eintritt oder Ausscheiden im Laufe eines Kalenderjahres wird der Urlaub anteilig gewährt (Zwölftelungsprinzip, unter Beachtung der gesetzlichen Mindestregelungen).</li>
          <li style="margin-bottom:6px;">Der vertragliche Zusatzurlaub verfällt am 31. März des Folgejahres, auch wenn er wegen Arbeitsunfähigkeit nicht genommen werden konnte. Bei Beendigung des Arbeitsverhältnisses ist ein Anspruch auf Urlaubsabgeltung hinsichtlich des Zusatzurlaubs ausgeschlossen.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 6px 0;">§ 7 Arbeitsverhinderung und Krankheit</h3>
        <ol style="margin:0 0 12px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Der Arbeitnehmer ist verpflichtet, dem Arbeitgeber jede Arbeitsverhinderung und ihre voraussichtliche Dauer <strong>unverzüglich</strong> (vor Arbeitsbeginn am ersten Tag der Verhinderung) telefonisch oder per E-Mail anzuzeigen.</li>
          <li style="margin-bottom:6px;">Dauert eine Arbeitsunfähigkeit länger als drei Kalendertage, hat der Arbeitnehmer spätestens am darauffolgenden Arbeitstag (dem vierten Tag) eine ärztliche Bescheinigung über das Bestehen der Arbeitsunfähigkeit sowie deren voraussichtliche Dauer vorzulegen bzw. das Vorliegen zur elektronischen Abrufung (eAU) sicherzustellen.</li>
          <li style="margin-bottom:6px;">Der Arbeitgeber ist berechtigt, die Vorlage der ärztlichen Bescheinigung / Meldung bereits ab dem <strong>ersten Tag</strong> der Erkrankung zu verlangen.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 6px 0;">§ 8 Nebentätigkeit</h3>
        <p style="margin:0 0 12px 0;text-align:justify;">
          Jede entgeltliche Nebentätigkeit sowie jede unentgeltliche Nebentätigkeit, die die Arbeitsleistung des Arbeitnehmers oder die Interessen des Arbeitgebers beeinträchtigen könnte, bedarf der vorherigen schriftlichen Zustimmung des Arbeitgebers. Der Arbeitnehmer verpflichtet sich, Änderungen einer genehmigten Nebentätigkeit unverzüglich anzuzeigen.
        </p>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 6px 0;">§ 9 Verschwiegenheitspflicht</h3>
        <p style="margin:0 0 12px 0;text-align:justify;">
          Der Arbeitnehmer verpflichtet sich, über alle Betriebs- und Geschäftsgeheimnisse sowie alle sonstigen vertraulichen Angelegenheiten des Arbeitgebers und dessen Kunden (insbesondere Preislisten, Kalkulationen, Projektdaten, Kundendaten), die ihm im Rahmen seiner Tätigkeit bekannt werden, sowohl während der Dauer des Arbeitsverhältnisses als auch nach dessen Beendigung strengstes Stillschweigen zu bewahren. Ergänzend gilt die als <strong>Anlage 1</strong> beigefügte gesonderte Vertraulichkeitsvereinbarung.
        </p>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 6px 0;">§ 10 Vertragsstrafe</h3>
        <p style="margin:0 0 12px 0;text-align:justify;">
          Tritt der Arbeitnehmer das Arbeitsverhältnis schuldhaft nicht an oder löst er das Arbeitsverhältnis vertragswidrig ohne Einhaltung der maßgeblichen Kündigungsfrist und ohne wichtigen Grund auf, so hat er an den Arbeitgeber eine Vertragsstrafe in Höhe eines halben Bruttomonatsgehalts zu zahlen. Während der Probezeit reduziert sich die Vertragsstrafe auf die Höhe der Vergütung, die der Arbeitnehmer während der zweiwöchigen Kündigungsfrist verdient hätte. Die Geltendmachung eines weitergehenden Schadens bleibt unberührt.
        </p>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 6px 0;">§ 11 Schlussbestimmungen</h3>
        <ol style="margin:0 0 18px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Mündliche Nebenabreden bestehen nicht. Änderungen oder Ergänzungen dieses Vertrages bedürfen zu ihrer Wirksamkeit der Text- oder Schriftform. Dies gilt auch für die Änderung dieser Klausel selbst, sofern es sich nicht um individuelle Vertragsabreden (§ 305b BGB) handelt.</li>
          <li style="margin-bottom:6px;">Sollten einzelne Bestimmungen dieses Vertrages ganz oder teilweise unwirksam sein oder werden, so wird hierdurch die Gültigkeit der übrigen Bestimmungen nicht berührt.</li>
        </ol>

        <p style="margin:24px 0 36px 0;">Karben, den <strong>${signedDate}</strong></p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:36px;">
          <div>
            <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
            <div><strong>Arbeitgeber</strong></div>
            <div>Brünel Deutschland UG (haftungsbeschränkt)</div>
            <div>Sam Rastegar Moghadam</div>
          </div>
          <div>
            <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
            <div><strong>Arbeitnehmer</strong></div>
            <div>(${partySignatureLabel})</div>
          </div>
        </div>
        ${renderPageFooter('Arbeitsvertrag — Brünel Deutschland UG')}

        <div class="page-break" style="margin:36px 0;border-top:2px dashed #cbd5e1;padding-top:28px;"></div>

        ${renderPageHeader()}
        <h2 style="font-size:15pt;font-weight:800;margin:0 0 16px 0;color:#111827;">Anlage 1 zum Arbeitsvertrag – Vertraulichkeitsvereinbarung</h2>
        <p style="margin:0 0 8px 0;">Zwischen</p>
        <p style="margin:0 0 4px 0;"><strong>Brünel Deutschland UG (haftungsbeschränkt)</strong></p>
        <p style="margin:0 0 4px 0;">Ramonville Str. 28, 61184 Karben</p>
        <p style="margin:0 0 4px 0;">vertreten durch den Geschäftsführer Herrn Sam Rastegar Moghadam</p>
        <p style="margin:0 0 12px 0;color:#374151;">– nachfolgend „Arbeitgeber“ genannt –</p>
        <p style="margin:0 0 8px 0;">und</p>
        <p style="margin:0 0 4px 0;">${partyLineAccusative}</p>
        <p style="margin:0 0 4px 0;">wohnhaft in: <strong>${fullAddress}</strong></p>
        <p style="margin:0 0 16px 0;color:#374151;">– nachfolgend „Arbeitnehmer“ genannt –</p>

        <h3 style="font-size:11pt;font-weight:700;margin:14px 0 6px 0;">§ 1 Gegenstand der Vereinbarung</h3>
        <p style="margin:0 0 10px 0;text-align:justify;">
          Der Arbeitnehmer erhält im Rahmen seiner Tätigkeit als <strong>${roleTitle}</strong> Einblick in vertrauliche Informationen, Geschäfts- und Betriebsgeheimnisse des Arbeitgebers sowie der mit ihm verbundenen Unternehmen, Kunden, Auftraggeber und Nachunternehmer (Subunternehmer). Diese Vereinbarung regelt den Schutz dieser sensiblen Daten.
        </p>

        <h3 style="font-size:11pt;font-weight:700;margin:14px 0 6px 0;">§ 2 Vertrauliche Informationen</h3>
        <p style="margin:0 0 8px 0;text-align:justify;">
          „Vertrauliche Informationen“ im Sinne dieser Vereinbarung sind alle kaufmännischen, technischen, finanziellen und organisatorischen Informationen, unabhängig davon, ob sie schriftlich, elektronisch, mündlich oder in anderer Form zugänglich gemacht wurden. Dazu gehören insbesondere, aber nicht ausschließlich:
        </p>
        <ol style="margin:0 0 10px 0;padding-left:20px;text-align:justify;">
          <li>Kunden-, Lieferanten- und Subunternehmerdatenbanken sowie Kontaktlisten.</li>
          <li>Preiskalkulationen, Angebote, Verträge, Stundensätze und Margen.</li>
          <li>Projektpläne, Baupläne, Netzpläne (z. B. Glasfaser-/IT-Infrastruktur), Dokumentationen und Passwörter/Zugangsdaten.</li>
          <li>Interne Arbeitsabläufe, Softwarelösungen und Unternehmensstrategien.</li>
          <li>Personenbezogene Daten von Mitarbeitern, Kunden oder Dritten (Datenschutz/DSGVO).</li>
        </ol>

        <h3 style="font-size:11pt;font-weight:700;margin:14px 0 6px 0;">§ 3 Vertraulichkeitspflicht</h3>
        <ol style="margin:0 0 10px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:5px;">Der Arbeitnehmer verpflichtet sich, über alle ihm bekannt gewordenen vertraulichen Informationen strengstes Stillschweigen zu bewahren.</li>
          <li style="margin-bottom:5px;">Es ist dem Arbeitnehmer untersagt, vertrauliche Informationen ohne vorherige Zustimmung des Arbeitgebers an unbefugte Dritte weiterzugeben, zu veröffentlichen oder für eigene, außerdienstliche Zwecke bzw. für Dritte zu verwerten.</li>
          <li style="margin-bottom:5px;">Der Arbeitnehmer wird alle erforderlichen Maßnahmen treffen, um zu verhindern, dass Dritte unbefugt Kenntnis von vertraulichen Informationen erlangen (z. B. durch Sperren von Bildschirmen, sicheres Aufbewahren von Unterlagen, Geheimhaltung von Passwörtern).</li>
          <li style="margin-bottom:5px;">Geschäftliche Dokumente, Dateien oder E-Mails dürfen nicht auf private Speichermedien kopiert oder an private E-Mail-Adressen weitergeleitet werden.</li>
        </ol>

        <h3 style="font-size:11pt;font-weight:700;margin:14px 0 6px 0;">§ 4 Rückgabe und Vernichtung von Unterlagen</h3>
        <p style="margin:0 0 10px 0;text-align:justify;">
          Auf jederzeitiges Verlangen des Arbeitgebers, spätestens jedoch bei Beendigung des Arbeitsverhältnisses (oder ab dem Zeitpunkt einer Freistellung), hat der Arbeitnehmer sämtliche ihm überlassenen geschäftlichen Unterlagen, Datenträger, Geräte (z.B. Laptop, Smartphone), Schlüssel sowie alle Kopien und Aufzeichnungen unaufgefordert und vollständig an den Arbeitgeber zurückzugeben. Ein Zurückbehaltungsrecht ist ausgeschlossen.
        </p>

        <h3 style="font-size:11pt;font-weight:700;margin:14px 0 6px 0;">§ 5 Vertragsstrafe und Schadensersatz</h3>
        <p style="margin:0 0 10px 0;text-align:justify;">
          Bei einem schuldhaften Verstoß gegen die Verpflichtungen aus dieser Vereinbarung ist der Arbeitnehmer dem Arbeitgeber zum Ersatz des daraus entstehenden Schadens verpflichtet. Zudem weist der Arbeitgeber darauf hin, dass der Verrat von Geschäfts- und Betriebsgeheimnissen nach dem Gesetz zum Schutz von Geschäftsgeheimnissen (GeschGehG) auch strafrechtliche Konsequenzen nach sich ziehen kann.
        </p>

        <h3 style="font-size:11pt;font-weight:700;margin:14px 0 6px 0;">§ 6 Geltungsdauer und Schlussbestimmungen</h3>
        <p style="margin:0 0 16px 0;text-align:justify;">
          Die Verpflichtung zur Geheimhaltung gilt während der gesamten Dauer des Arbeitsverhältnisses und besteht auch nach Beendigung des Arbeitsverhältnisses zeitlich unbegrenzt fort, solange die Informationen nicht öffentlich bekannt geworden sind.
        </p>

        <p style="margin:20px 0 32px 0;">Karben, den <strong>${signedDate}</strong></p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px;">
          <div>
            <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
            <div><strong>Arbeitgeber</strong></div>
            <div>Brünel Deutschland UG (haftungsbeschränkt)</div>
            <div>Sam Rastegar Moghadam</div>
          </div>
          <div>
            <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
            <div><strong>Arbeitnehmer</strong></div>
            <div>(${partySignatureLabel})</div>
          </div>
        </div>
        ${renderPageFooter('Anlage 1: Vertraulichkeitsvereinbarung — Brünel Deutschland UG')}
      </div>
    `;
  }

  if (code === 'KFZ_UEBERGABE') {
    const vehModel = cond.vehicle_model || '............................................................';
    const vehPlate = cond.vehicle_plate || '............................................................';
    const vehVin = cond.vehicle_vin || '............................................................';
    const vehKm = cond.vehicle_mileage ? `${Number(cond.vehicle_mileage).toLocaleString('de-DE')} km` : '............................................................ km';
    const vehTuv = cond.vehicle_tuv ? fmtDeDate(cond.vehicle_tuv) : '............................................................';
    const condOk = cond.vehicle_condition !== 'defects';
    const defectsText = cond.vehicle_defects || 'Keine sichtbaren Schäden / Mängel bei Übergabe festgestellt.';
    const keysCount = cond.vehicle_keys_count || '2';
    const fuelCard = cond.vehicle_fuel_card || 'DKV / Shell / Aral';
    const extraAcc = cond.vehicle_extra_accessories || 'Spleißkoffer / Standard-Bordwerkzeug';

    return `
      <div class="brn-contract-sheet">
        ${renderPageHeader()}
        <h1 style="font-size:16.5pt;font-weight:800;margin:0 0 16px 0;color:#111827;">Kfz-Übergabeprotokoll und Nutzungsvereinbarung</h1>
        <p style="margin:0 0 8px 0;">Zwischen</p>
        <p style="margin:0 0 4px 0;"><strong>Brünel Deutschland UG (haftungsbeschränkt)</strong></p>
        <p style="margin:0 0 4px 0;">Ramonville Str. 28, 61184 Karben</p>
        <p style="margin:0 0 4px 0;">vertreten durch den Geschäftsführer Herrn Sam Rastegar Moghadam</p>
        <p style="margin:0 0 12px 0;color:#374151;">– nachfolgend „Arbeitgeber“ genannt –</p>
        <p style="margin:0 0 8px 0;">und</p>
        <p style="margin:0 0 4px 0;">${partyLineAccusative}</p>
        <p style="margin:0 0 4px 0;">wohnhaft in: <strong>${fullAddress}</strong></p>
        <p style="margin:0 0 16px 0;color:#374151;">– nachfolgend „Mitarbeiter / Nutzer“ genannt –</p>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 1 Fahrzeugdaten</h3>
        <p style="margin:0 0 8px 0;">Dem Mitarbeiter wird zur Ausübung seiner beruflichen Tätigkeit folgendes Firmenfahrzeug übergeben:</p>
        <ul style="margin:0 0 14px 0;padding-left:20px;line-height:1.75;">
          <li><strong>Fahrzeugmarke / Modell:</strong> ${vehModel}</li>
          <li><strong>Amtliches Kennzeichen:</strong> ${vehPlate}</li>
          <li><strong>Fahrgestellnummer (FIN):</strong> ${vehVin}</li>
          <li><strong>Kilometerstand bei Übergabe:</strong> ${vehKm}</li>
          <li><strong>Nächste HU/TÜV:</strong> ${vehTuv}</li>
        </ul>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 2 Zustand bei Übergabe</h3>
        <p style="margin:0 0 6px 0;">Das Fahrzeug befindet sich bei Übergabe in einem:</p>
        <p style="margin:0 0 4px 0;">[${condOk ? 'X' : ' '}] einwandfreien, unbeschädigten und gereinigten Zustand.</p>
        <p style="margin:0 0 8px 0;">[${!condOk ? 'X' : ' '}] folgenden Zustand (vorhandene Mängel/Kratzer/Schäden bitte genau auflisten):</p>
        <p style="margin:0 0 14px 0;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;">
          <strong>Vorhandene Mängel/Schäden:</strong> ${defectsText}
        </p>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 3 Übergebenes Zubehör und Unterlagen</h3>
        <p style="margin:0 0 6px 0;">Mit dem Fahrzeug wurden folgende Gegenstände vollständig übergeben:</p>
        <ul style="margin:0 0 14px 0;padding-left:20px;line-height:1.75;">
          <li>[X] Fahrzeugschlüssel (Anzahl: <strong>${keysCount}</strong>)</li>
          <li>[X] Zulassungsbescheinigung Teil I (Fahrzeugschein im Original / Kopie)</li>
          <li>[X] Tankkarte / Ladekarte (Anbieter: <strong>${fuelCard}</strong>)</li>
          <li>[X] Verbandskasten, Warndreieck, Warnweste(n)</li>
          <li>[X] Sonstiges: <strong>${extraAcc}</strong></li>
        </ul>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 4 Nutzungsbedingungen und Führerschein</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Das Fahrzeug darf <strong>ausschließlich zu dienstlichen Zwecken</strong> (Fahrten zu Baustellen, Kunden, Materialbeschaffung) genutzt werden. Eine private Nutzung ist ohne ausdrückliche, gesonderte schriftliche Genehmigung des Arbeitgebers <strong>untersagt</strong>.</li>
          <li style="margin-bottom:6px;">Das Fahrzeug darf nur vom Mitarbeiter selbst oder anderen autorisierten Mitarbeitern des Arbeitgebers geführt werden. Die Überlassung an Dritte (z. B. Familienangehörige, Freunde) ist strengstens verboten.</li>
          <li style="margin-bottom:6px;">Der Mitarbeiter versichert, im Besitz einer gültigen Fahrerlaubnis zu sein. Einen drohenden oder erfolgten Entzug der Fahrerlaubnis oder ein Fahrverbot hat der Mitarbeiter dem Arbeitgeber <strong>sofort und unaufgefordert</strong> mitzuteilen. Ohne gültigen Führerschein darf das Fahrzeug unter keinen Umständen bewegt werden.</li>
          <li style="margin-bottom:6px;">Im Fahrzeug gilt ein absolutes <strong>Rauch-, Alkohol- und Drogenverbot</strong>.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 5 Strafzettel, Bußgelder und Ordnungswidrigkeiten</h3>
        <p style="margin:0 0 14px 0;text-align:justify;">
          Der Mitarbeiter ist für die Einhaltung sämtlicher Straßenverkehrs- und Parkvorschriften selbst verantwortlich. Alle während der Nutzungsdauer anfallenden Verwarnungsgelder, Bußgelder, Abschleppkosten oder Strafen wegen Verkehrsordnungswidrigkeiten (z.B. Geschwindigkeitsüberschreitung, Falschparken) trägt der Mitarbeiter in voller Höhe selbst. Verauslagt der Arbeitgeber solche Beträge, ist er berechtigt, diese mit der nächsten Gehaltsabrechnung des Mitarbeiters zu verrechnen.
        </p>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 6 Verhalten bei Unfällen und Schäden</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Bei jedem Unfall, Diebstahl oder sonstigen Schaden am Fahrzeug ist <strong>unverzüglich die Polizei</strong> hinzuzuziehen und der Arbeitgeber (Geschäftsführung) sofort telefonisch zu informieren.</li>
          <li style="margin-bottom:6px;">Der Mitarbeiter darf am Unfallort kein Schuldanerkenntnis abgeben.</li>
          <li style="margin-bottom:6px;">Für Schäden am Fahrzeug haftet der Mitarbeiter nach den gesetzlichen Grundsätzen über den innerbetrieblichen Schadensausgleich (volle Haftung bei Vorsatz und grober Fahrlässigkeit, anteilige Haftung bei mittlerer Fahrlässigkeit).</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 7 Pflege, Wartung und Rückgabe</h3>
        <ol style="margin:0 0 18px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Der Mitarbeiter ist verpflichtet, das Fahrzeug pfleglich zu behandeln, sauber zu halten und regelmäßig den Reifendruck, Ölstand sowie die Verkehrssicherheit zu kontrollieren.</li>
          <li style="margin-bottom:6px;">Der Arbeitgeber ist jederzeit berechtigt, das Fahrzeug (insbesondere bei Ende des Projekts, längerer Krankheit, Freistellung oder Beendigung des Arbeitsverhältnisses) herauszuverlangen. Ein Zurückbehaltungsrecht des Mitarbeiters am Fahrzeug ist ausgeschlossen.</li>
        </ol>

        <p style="margin:22px 0 34px 0;">Karben, den <strong>${signedDate}</strong> (Datum der Übergabe)</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:34px;">
          <div>
            <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
            <div><strong>Arbeitgeber (Übergebender)</strong></div>
            <div>Brünel Deutschland UG (haftungsbeschränkt)</div>
            <div>Sam Rastegar Moghadam</div>
          </div>
          <div>
            <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
            <div><strong>Mitarbeiter (Empfänger)</strong></div>
            <div>(${partySignatureLabel})</div>
          </div>
        </div>
        ${renderPageFooter('Kfz-Übergabeprotokoll und Nutzungsvereinbarung — Brünel Deutschland UG')}
      </div>
    `;
  }

  if (code === 'PRAKTIKUM') {
    return `
      <div class="brn-contract-sheet">
        ${renderPageHeader()}
        <h1 style="font-size:16.5pt;font-weight:800;margin:0 0 16px 0;color:#111827;">Vertrag über ein unbezahltes Orientierungspraktikum (Einfühlungsverhältnis)</h1>
        <p style="margin:0 0 8px 0;">Zwischen</p>
        <p style="margin:0 0 4px 0;"><strong>Brünel Deutschland UG (haftungsbeschränkt)</strong></p>
        <p style="margin:0 0 4px 0;">Ramonville Str. 28, 61184 Karben</p>
        <p style="margin:0 0 4px 0;">vertreten durch den Geschäftsführer Herrn Sam Rastegar Moghadam</p>
        <p style="margin:0 0 12px 0;color:#374151;">– nachfolgend „Unternehmen“ genannt –</p>
        <p style="margin:0 0 8px 0;">und</p>
        <p style="margin:0 0 4px 0;">${partyLineAccusative}</p>
        <p style="margin:0 0 4px 0;">wohnhaft in: <strong>${fullAddress}</strong></p>
        <p style="margin:0 0 16px 0;color:#374151;">– nachfolgend „Praktikant“ genannt –</p>
        <p style="margin:0 0 16px 0;">wird folgende Vereinbarung geschlossen:</p>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 1 Zweck und Dauer des Orientierungspraktikums</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Der Praktikant absolviert in der Zeit vom <strong>${praktikumStart}</strong> bis zum <strong>${praktikumEnd}</strong> ein Orientierungspraktikum (sog. Einfühlungsverhältnis) im Unternehmen.</li>
          <li style="margin-bottom:6px;">Zweck dieses Praktikums ist das unverbindliche, gegenseitige Kennenlernen sowie die berufliche Orientierung des Praktikanten im Tätigkeitsfeld des Unternehmens (Hands-on-Training / Mitlaufen im Tagesgeschäft). Es soll geprüft werden, ob die Voraussetzungen für eine spätere Zusammenarbeit (z.B. im Rahmen eines Arbeitsverhältnisses oder einer Zusammenarbeit als selbstständiger Subunternehmer) gegeben sind.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 2 Kein Arbeitsverhältnis und keine Arbeitspflicht</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Durch diese Vereinbarung wird ausdrücklich <strong>kein Arbeitsverhältnis</strong> im Sinne des § 611a BGB begründet.</li>
          <li style="margin-bottom:6px;">Der Praktikant unterliegt keinem arbeitsrechtlichen Direktionsrecht hinsichtlich Zeit, Dauer und Inhalt einer Arbeitsleistung. Er ist nicht zur Erbringung einer wirtschaftlich verwertbaren Arbeitsleistung für das Unternehmen verpflichtet.</li>
          <li style="margin-bottom:6px;">Der Praktikant begleitet die Mitarbeiter des Unternehmens lediglich zu Lern- und Orientierungszwecken. Er hat jedoch das Hausrecht sowie die Sicherheits- und Unfallverhütungsvorschriften an den jeweiligen Einsatzorten strikt zu beachten.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 3 Vergütung und Mindestlohngesetz (MiLoG)</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Da im Rahmen dieses Orientierungspraktikums der Ausbildungs-, Kennenlern- und Orientierungszweck im Vordergrund steht und keine wirtschaftlich verwertbare Arbeitsleistung geschuldet wird, erfolgt das Praktikum <strong>unentgeltlich (unbezahlt)</strong>.</li>
          <li style="margin-bottom:6px;">Gemäß § 22 Abs. 1 Nr. 2 Mindestlohngesetz (MiLoG) ist ein solches Orientierungspraktikum von bis zu drei Monaten Dauer zur beruflichen Orientierung von der Zahlung des gesetzlichen Mindestlohns befreit.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 4 Haftungsbeschränkung und Verschwiegenheitspflicht</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Das Unternehmen haftet für Schäden, die der Praktikant während des Aufenthalts im Betrieb oder auf Baustellen erleidet, nur bei Vorsatz und grober Fahrlässigkeit, soweit nicht gesetzlich zwingend (z. B. über die gesetzliche Unfallversicherung / Berufsgenossenschaft) eine anderweitige Absicherung besteht.</li>
          <li style="margin-bottom:6px;">Der Praktikant verpflichtet sich, über alle ihm während des Praktikums bekannt werdenden Geschäfts- und Betriebsgeheimnisse, Kundendaten sowie internen Abläufe des Unternehmens auch nach Ende des Praktikums strengstes Stillschweigen zu bewahren.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 5 Beendigung</h3>
        <p style="margin:0 0 18px 0;text-align:justify;">
          Das Orientierungspraktikum endet mit Ablauf des in § 1 genannten Zeitraums automatisch, ohne dass es einer Kündigung bedarf. Zudem kann das Verhältnis während der Laufzeit von beiden Seiten jederzeit und sofort ohne Angabe von Gründen beendet werden. Ein Anspruch auf Übernahme in ein anschließendes Arbeits- oder Auftragsverhältnis besteht nicht.
        </p>

        <p style="margin:22px 0 34px 0;">Karben, den <strong>${signedDate}</strong></p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:34px;">
          <div>
            <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
            <div><strong>Unternehmen</strong></div>
            <div>Brünel Deutschland UG (haftungsbeschränkt)</div>
            <div>Sam Rastegar Moghadam</div>
          </div>
          <div>
            <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
            <div><strong>Praktikant</strong></div>
            <div>(${partySignatureLabel})</div>
          </div>
        </div>
        ${renderPageFooter('Vertrag über ein unbezahltes Orientierungspraktikum — Brünel Deutschland UG')}
      </div>
    `;
  }

  if (code === 'SUBUNTERNEHMER') {
    const subLocation = cond.sub_location || '77704 Oberkirch';
    const subRadius = cond.sub_radius_km || '50';
    const rateA = fmtDeCurrency(cond.sub_rate_variante_a ?? 40.0);
    const rateB = fmtDeCurrency(cond.sub_rate_variante_b ?? 35.0);
    const payTermDays = cond.sub_payment_term_days || '30';

    return `
      <div class="brn-contract-sheet">
        ${renderPageHeader()}
        <h1 style="font-size:17pt;font-weight:800;margin:0 0 16px 0;color:#111827;">Subunternehmervertrag (Werkvertrag)</h1>
        <p style="margin:0 0 8px 0;">Zwischen</p>
        <p style="margin:0 0 4px 0;"><strong>Brünel Deutschland UG (haftungsbeschränkt)</strong></p>
        <p style="margin:0 0 4px 0;">Ramonville Str. 28, 61184 Karben</p>
        <p style="margin:0 0 4px 0;">vertreten durch den Geschäftsführer Herrn Sam Rastegar Moghadam</p>
        <p style="margin:0 0 12px 0;color:#374151;">– nachfolgend „Auftraggeber“ genannt –</p>
        <p style="margin:0 0 8px 0;">und</p>
        <p style="margin:0 0 4px 0;">${partyLineSubunternehmer}</p>
        <p style="margin:0 0 4px 0;">Anschrift: <strong>${fullAddress}</strong></p>
        <p style="margin:0 0 16px 0;color:#374151;">– nachfolgend „Subunternehmer“ oder „Auftragnehmer“ genannt –</p>
        <p style="margin:0 0 16px 0;">wird folgender Rahmen- bzw. Projektwerkvertrag geschlossen:</p>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 1 Vertragsgegenstand, Einsatzort und Leistungsumfang</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Der Auftraggeber überträgt dem Subunternehmer die eigenverantwortliche Ausführung von Montage- und Installationsarbeiten im Bereich des Inhouse-Glasfaserausbaus (Netz-Ebene 4 / NE4) in Bestandsgebäuden.</li>
          <li style="margin-bottom:6px;"><strong>Projektstandort:</strong> Das aktuelle Projekt befindet sich in <strong>${subLocation}</strong> sowie in den umliegenden Städten und Gemeinden im Umkreis von bis zu <strong>${subRadius} km</strong>.</li>
          <li style="margin-bottom:6px;"><strong>Leistungsumfang:</strong> Die Tätigkeit umfasst die fachgerechte Verlegung von Aufputz-Kabelkanälen (PVC/Metall) im Keller und Treppenhaus bis in die einzelnen Wohneinheiten (WE), das Einziehen der Glasfaserkabel sowie das Spleißen und die Montage der Teilnehmeranschlussdosen (TA-Dosen) und des Spleißverteilers (AP/GF-GV).</li>
          <li style="margin-bottom:6px;"><strong>Wichtiger Hinweis (Verbot baulicher Veränderungen):</strong> Es handelt sich um reine Aufputz-Montagearbeiten. Es dürfen ausdrücklich <strong>keine massiven baulichen Veränderungen</strong> am Gebäude vorgenommen werden, und es erfolgen <strong>keinerlei Arbeiten an elektrischen Anlagen (230V-Stromnetz)</strong>. Die als Anlage beigefügten Ausführungs- und Sicherheitsrichtlinien sind zwingender Bestandteil dieses Vertrages.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 2 Pflichten, Materialnutzung und Fahrtkosten</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;"><strong>Material:</strong> Das für die Installation erforderliche Montagematerial (Glasfaserkabel, Kabelkanäle, TA-Dosen, Spleißboxen) wird vom Auftraggeber kostenlos zur Verfügung gestellt. Der Subunternehmer verpflichtet sich zu einem äußerst sorgsamen und sparsamen Umgang mit dem Material. Materialschwund, der durch unsachgemäße Arbeit oder Verschwendung des Subunternehmers entsteht, sowie der Verlust von überlassenem Material wird dem Subunternehmer in Rechnung gestellt bzw. mit seiner Vergütung verrechnet.</li>
          <li style="margin-bottom:6px;"><strong>Werkzeug &amp; Fahrzeug:</strong> Der Subunternehmer arbeitet als selbstständiger Unternehmer mit eigenem Werkzeug, eigenen Mess-/Spleißgeräten, eigener persönlicher Schutzausrüstung (PSA) und eigenem Fahrzeug.</li>
          <li style="margin-bottom:6px;"><strong>Fahrtkosten:</strong> Sämtliche Fahrt- und Anreisekosten innerhalb des Einsatzgebietes (${subLocation} + ${subRadius} km Umkreis) sind mit der vereinbarten Stückvergütung vollständig abgegolten und werden <strong>nicht</strong> gesondert erstattet.</li>
          <li style="margin-bottom:6px;"><strong>Selbstständigkeit:</strong> Der Subunternehmer handelt in eigenem Namen und auf eigene Rechnung. Er ist für die ordnungsgemäße Anmeldung seines Gewerbes sowie für die Abführung sämtlicher Steuern (Einkommen-/Umsatzsteuer) und Sozialversicherungsbeiträge selbst verantwortlich.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 3 Vergütung (Stücklohn) und Abrechnung</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Die Vergütung erfolgt leistungsbezogen nach fertiggestellten und erfolgreich abgenommenen Wohneinheiten (WE):
            <ul style="margin:6px 0;padding-left:20px;">
              <li><strong>Variante A (Vollausbau): ${rateA} EUR</strong> (netto) pro fertiggestellter Wohneinheit (WE). Dies beinhaltet: Kompletter Leitungsweg inkl. Kabelkanal, Kabeleinzug, Spleißarbeiten am Hausübergabepunkt (AP) und in der Wohnung (TA-Dose) sowie Mess-/Fotodokumentation.</li>
              <li><strong>Variante B (Teilausbau / Vorrüstung): ${rateB} EUR</strong> (netto) pro Wohneinheit (WE). Dies greift, wenn einzelne Wohnungen trotz Terminankündigung nicht zugänglich sind: Verlegung des Kabelkanals und des Glasfaserkabels bis vor die jeweilige Wohnungstür sowie Vorbereitung/Spleißen im Keller (AP), jedoch ohne Montage und Spleißen der TA-Dose in der Wohnung.</li>
            </ul>
          </li>
          <li style="margin-bottom:6px;"><strong>Rechnungsstellung:</strong> Der Subunternehmer erstellt alle <strong>14 Tage</strong> eine ordnungsgemäße Rechnung über die im jeweiligen Zeitraum vollständig abgeschlossenen und dokumentierten Gebäude/Wohneinheiten.</li>
          <li style="margin-bottom:6px;"><strong>Abnahme und Zahlungsziel:</strong> Voraussetzung für die Fälligkeit der Vergütung ist die vollständige und fehlerfreie Einreichung des digitalen Abnahmeprotokolls (inkl. geforderter Fotos und Messwerte) über das vom Auftraggeber vorgegebene Portal/System sowie die erfolgreiche Endabnahme durch den Hauptauftraggeber. Die Auszahlung des Rechnungsbetrages erfolgt innerhalb von <strong>${payTermDays} Tagen</strong> nach Eingang der prüfbaren Rechnung und erfolgter Abnahme.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 4 Haftung, Gewährleistung und Versicherungsnachweis</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Der Subunternehmer steht für die mangelfreie und fachgerechte Ausführung seiner Werkleistungen nach den gesetzlichen Vorschriften des BGB ein. Mängel oder fehlerhafte Spleißungen hat er auf eigene Kosten unverzüglich nachzubessern.</li>
          <li style="margin-bottom:6px;">Der Subunternehmer haftet in vollem Umfang für alle Personen-, Sach- und Vermögensschäden (insbesondere Leitungsschäden beim Bohren oder Schäden am Eigentum der Hausbewohner/Hauseigentümer), die er oder seine Erfüllungsgehilfen im Rahmen der Auftragsausführung verursachen.</li>
          <li style="margin-bottom:6px;"><strong>Pflichtversicherung:</strong> Der Subunternehmer ist zwingend verpflichtet, vor Beginn der Arbeiten eine gültige <strong>Betriebshaftpflichtversicherung</strong> mit ausreichender Deckungssumme (für Personen-, Sach- und Bearbeitungsschäden, inkl. Tätigkeitsschäden an Leitungen) abzuschließen und dem Auftraggeber unaufgefordert eine Kopie der Versicherungspolice sowie den Nachweis der Beitragszahlung vorzulegen. Ohne diesen Nachweis darf mit den Arbeiten nicht begonnen werden.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 5 Laufzeit, Kündigung und Folgeprojekte</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;">Dieser Vertrag tritt mit Unterzeichnung in Kraft und gilt zunächst für das genannte Projekt im Raum ${subLocation}. Bei erfolgreicher und zuverlässiger Zusammenarbeit besteht die Option auf Beauftragung für weitere bundesweite Folgeprojekte.</li>
          <li style="margin-bottom:6px;">Der Vertrag kann von beiden Vertragsparteien jederzeit ordentlich mit einer Frist von <strong>zwei Wochen</strong> in Text- oder Schriftform gekündigt werden.</li>
          <li style="margin-bottom:6px;">Das Recht zur außerordentlichen, fristlosen Kündigung aus wichtigem Grund bleibt unberührt. Ein wichtiger Grund für den Auftraggeber liegt insbesondere vor, wenn der Subunternehmer gegen Sicherheitsvorschriften verstößt, keine gültige Betriebshaftpflichtversicherung nachweist, wiederholt mangelhafte Arbeit leistet oder Termine unentschuldigt nicht wahrnimmt.</li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:700;margin:16px 0 8px 0;">§ 6 Schlussbestimmungen</h3>
        <p style="margin:0 0 16px 0;text-align:justify;">
          Mündliche Nebenabreden bestehen nicht. Änderungen oder Ergänzungen dieses Vertrages bedürfen der Schriftform. Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist – soweit gesetzlich zulässig – der Sitz des Auftraggebers.
        </p>

        <p style="margin:20px 0 32px 0;">Karben, den <strong>${signedDate}</strong></p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px;">
          <div>
            <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
            <div><strong>Auftraggeber</strong></div>
            <div>Brünel Deutschland UG (haftungsbeschränkt)</div>
            <div>Sam Rastegar Moghadam</div>
          </div>
          <div>
            <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
            <div><strong>Subunternehmer / Auftragnehmer</strong></div>
            <div>(${partySignatureLabel})</div>
          </div>
        </div>
        ${renderPageFooter('Subunternehmervertrag (Werkvertrag) — Brünel Deutschland UG')}

        <div class="page-break" style="margin:36px 0;border-top:2px dashed #cbd5e1;padding-top:28px;"></div>

        ${renderPageHeader()}
        <h2 style="font-size:14.5pt;font-weight:800;margin:0 0 6px 0;color:#111827;">Anlage zum Werkvertrag: Ausführungsrichtlinien und Sicherheitshinweise</h2>
        <p style="margin:0 0 14px 0;font-weight:700;color:#374151;">(Projekt: Inhouse-Glasfaserausbau NE4)</p>
        <p style="margin:0 0 14px 0;text-align:justify;">
          Diese Richtlinie ist verbindlicher Bestandteil des geschlossenen Subunternehmervertrages mit der <strong>Brünel Deutschland UG (haftungsbeschränkt)</strong>. Jeder Monteur / Subunternehmer ist verpflichtet, die nachfolgenden Qualitätsvorgaben und Sicherheitsregeln strikt einzuhalten.
        </p>

        <h3 style="font-size:11.5pt;font-weight:800;margin:14px 0 8px 0;color:#0f172a;">TEIL A: Schritt-für-Schritt Ausführungsrichtlinie (NE4-Montage)</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;"><strong>Schritt 1: Begehung, Kundenkontakt &amp; Vorbereitung</strong>
            <ul style="margin:4px 0;padding-left:18px;">
              <li>Höfliches und professionelles Auftreten gegenüber Hausverwaltung, Eigentümern und Mietern ist oberstes Gebot.</li>
              <li>Vor Arbeitsbeginn ist der genaue Leitungsweg gemäß Begehungsprotokoll (Keller → Steigzone/Treppenhaus → Wohnung) zu prüfen.</li>
            </ul>
          </li>
          <li style="margin-bottom:6px;"><strong>Schritt 2: Montage der Kabelkanäle (Reine Aufputz-Montage)</strong>
            <ul style="margin:4px 0;padding-left:18px;">
              <li>Die Verlegung erfolgt ausschließlich über Aufputz-Kabelkanäle (im Keller und Treppenhaus gemäß Brandschutzvorgaben meist Metallkanal oder zugelassener PVC-Kanal).</li>
              <li>Kanäle sind exakt waagerecht bzw. senkrecht (mit Wasserwaage!) und bündig an Wänden/Decken zu montieren.</li>
              <li><strong>Achtung:</strong> Es dürfen <strong>keine tragenden Bauteile</strong> beschädigt oder Schlitze in Wände gestemmt werden (keine massiven baulichen Veränderungen!).</li>
            </ul>
          </li>
          <li style="margin-bottom:6px;"><strong>Schritt 3: Wand- und Deckendurchbrüche (Bohrungen)</strong>
            <ul style="margin:4px 0;padding-left:18px;">
              <li>Vor <strong>jeder</strong> Bohrung ist die Wand/Decke zwingend mit einem geeigneten <strong>Leitungsdetektor (Ortungsgerät)</strong> auf Strom-, Wasser-, Gas- und Heizungsleitungen zu prüfen!</li>
              <li>Wohnungseinführungen sind so klein und sauber wie möglich zu bohren (in der Regel über der Wohnungseingangstür). Ausbrüche am Putz sind zu vermeiden.</li>
            </ul>
          </li>
          <li style="margin-bottom:6px;"><strong>Schritt 4: Kabeleinzug, Spleißen &amp; TA-Dosen-Montage</strong>
            <ul style="margin:4px 0;padding-left:18px;">
              <li>Beim Einziehen der Glasfaserkabel sind die minimal zulässigen <strong>Biegeradien</strong> zwingend einzuhalten (Glasfaser darf niemals geknickt werden!).</li>
              <li>Montage der Teilnehmeranschlussdose (GF-TA) in der Wohnung am abgestimmten Ort (Variante A) bzw. sauberes Ablegen mit Überlänge im Kanal vor der Wohnungstür (Variante B).</li>
              <li>Fachgerechtes Spleißen der Fasern in der TA-Dose und im Spleißverteiler (AP/GF-GV) im Keller unter Einhaltung maximaler Sauberkeit.</li>
            </ul>
          </li>
          <li style="margin-bottom:6px;"><strong>Schritt 5: Brandschutz, Reinigung &amp; Dokumentation</strong>
            <ul style="margin:4px 0;padding-left:18px;">
              <li>Alle Brandabschnitte (Decken-/Wanddurchbrüche zwischen Keller, Treppenhaus und Wohnungen) müssen nach Kabeleinzug zwingend wieder fachgerecht mit zugelassenem <strong>Brandschutzmaterial (Brandschutzschaum/-mörtel/-kissen)</strong> verschlossen werden.</li>
              <li>Der Arbeitsplatz (Keller, Treppenhaus, Wohnung) ist nach Abschluss der Arbeiten <strong>besenrein</strong> zu hinterlassen. Bohrmehl und Verpackungsmüll sind vollständig zu entsorgen.</li>
              <li>Vollständige Erstellung der Fotodokumentation, Beschriftung (Labeling) aller Komponenten und Übergabe des digitalen Abnahmeprotokolls im Portal.</li>
            </ul>
          </li>
        </ol>

        <h3 style="font-size:11.5pt;font-weight:800;margin:14px 0 8px 0;color:#991b1b;">TEIL B: Verbindliche Sicherheitsunterweisung (Arbeitsschutz)</h3>
        <ol style="margin:0 0 14px 0;padding-left:20px;text-align:justify;">
          <li style="margin-bottom:6px;"><strong>Absolutes Verbot von Elektroarbeiten (Lebensgefahr!):</strong> Es werden im Rahmen dieses Auftrags <strong>keinerlei Arbeiten an elektrischen Anlagen (230V / 400V)</strong> durchgeführt. Das Öffnen von Stromverteilerkästen, das Anklemmen von Stromleitungen oder das Verlegen von Glasfaserkabeln innerhalb fremder Starkstromkanäle ist strengstens verboten!</li>
          <li style="margin-bottom:6px;"><strong>Schutz vor dem Anbohren von Leitungen:</strong> Das Bohren im Bereich von Lichtschaltern, Steckdosen und Unterverteilungen (senkrechte und waagerechte Installationszonen nach DIN 18015) ist lebensgefährlich und untersagt. Die vorherige Prüfung mit einem Mess-/Ortungsgerät ist vor jedem Bohrvorgang Pflicht.</li>
          <li style="margin-bottom:6px;"><strong>Brandschutz &amp; Fluchtwege:</strong> Treppenhäuser sind Flucht- und Rettungswege! Während der Arbeiten dürfen Treppen und Ausgänge niemals vollständig durch Leitern, Werkzeug oder Material blockiert werden. Im Gebäude herrscht absolutes <strong>Rauchverbot</strong>.</li>
          <li style="margin-bottom:6px;"><strong>Arbeitssicherheit &amp; Umgang mit Glasfaser:</strong>
            <ul style="margin:4px 0;padding-left:18px;">
              <li>Bei Bohr- und Montagearbeiten ist die erforderliche <strong>Persönliche Schutzausrüstung (PSA)</strong> zu tragen (Sicherheitsschuhe, Schutzbrille beim Über-Kopf-Bohren, Gehörschutz, Staubschutzmaske).</li>
              <li>Es dürfen nur geprüfte und standsichere Leitern/Trittstufen verwendet werden.</li>
              <li><strong>Glasfasersplitter:</strong> Faserreste beim Abisolieren und Brechen (Cleaven) sind extrem scharfkantig und dürfen nicht auf den Boden (insbesondere nicht in Kundenwohnungen!) gelangen. Alle Faserreste müssen sofort in einem verschlossenen Splitterbehälter gesammelt und sicher entsorgt werden.</li>
              <li><strong>Laserstrahlung:</strong> Niemals direkt in offene Faserenden, Patchkabel oder optische Messgeräte (Laserquelle/OTDR) blicken – Gefahr schwerer Augenschäden!</li>
            </ul>
          </li>
          <li style="margin-bottom:6px;"><strong>Verhalten im Schadensfall:</strong> Sollte trotz aller Vorsicht eine Strom-, Wasser- oder Gasleitung angebohrt werden, sind die Arbeiten <strong>sofort einzustellen</strong>, der Gefahrenbereich abzusichern (ggf. Haupthahn/Sicherung schließen, bei Gas sofort Gebäude räumen und Feuerwehr rufen) und unverzüglich die Projektleitung der Brünel Deutschland UG zu informieren.</li>
        </ol>

        <div style="padding:12px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;margin-bottom:20px;">
          <strong>Bestätigung des Subunternehmers:</strong><br/>
          Ich bestätige hiermit, dass ich die vorstehenden Ausführungsrichtlinien sowie die Sicherheitsvorschriften vollständig gelesen und verstanden habe. Ich verpflichte mich, diese Vorgaben strikt einzuhalten und auch etwaige von mir eingesetzte Mitarbeiter vor Arbeitsbeginn nachweislich entsprechend zu unterweisen.
        </div>

        <p style="margin:18px 0 30px 0;">Karben, den <strong>${signedDate}</strong></p>
        <div style="max-width:340px;">
          <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
          <div><strong>Unterschrift Subunternehmer / Auftragnehmer</strong></div>
          <div>(${partySignatureLabel})</div>
        </div>
        ${renderPageFooter('Anlage Ausführungsrichtlinien & Sicherheitshinweise — Brünel Deutschland UG')}

        <div class="page-break" style="margin:36px 0;border-top:2px dashed #cbd5e1;padding-top:28px;"></div>

        ${renderPageHeader()}
        <h2 style="font-size:14.5pt;font-weight:800;margin:0 0 6px 0;color:#111827;">Allgemeines Sicherheitsblatt &amp; Arbeitsschutzrichtlinie</h2>
        <p style="margin:0 0 14px 0;font-weight:700;color:#374151;">(Standortübergreifende Sicherheitsvorschriften für Montage- und Glasfaserarbeiten)</p>
        <p style="margin:0 0 14px 0;text-align:justify;">
          Sicherheit und Gesundheitsschutz haben bei allen Projekten der <strong>Brünel Deutschland UG (haftungsbeschränkt)</strong> höchste Priorität. Dieses Sicherheitsblatt gilt verbindlich für alle eigenen Mitarbeiter, Praktikanten sowie beauftragten Subunternehmer und deren Personal auf sämtlichen Baustellen und in allen Kundenobjekten.
        </p>

        <h3 style="font-size:11pt;font-weight:700;margin:12px 0 6px 0;">1. Persönliche Schutzausrüstung (PSA)</h3>
        <p style="margin:0 0 6px 0;">Auf allen Baustellen und in Kundenobjekten ist das Tragen einer angemessenen Arbeitskleidung sowie der erforderlichen Persönlichen Schutzausrüstung zwingend vorgeschrieben:</p>
        <ul style="margin:0 0 12px 0;padding-left:20px;">
          <li><strong>Sicherheitsschuhe (mind. Klasse S3):</strong> Pflicht bei allen Montage- und Transportarbeiten.</li>
          <li><strong>Schutzbrille:</strong> Zwingend zu tragen bei allen Bohr-, Stemm- und Über-Kopf-Arbeiten sowie beim Umgang mit Glasfasern (Schutz vor umherfliegenden Faserresten).</li>
          <li><strong>Arbeitshandschuhe &amp; Gehörschutz:</strong> Pflicht beim Einsatz von Schlagbohrmaschinen, Bohrhammern und beim Einziehen von Kabeln.</li>
          <li><strong>Staubschutzmaske (FFP2/FFP3):</strong> Bei stauberzeugenden Bohrarbeiten in Kellern und engen Räumen.</li>
        </ul>

        <h3 style="font-size:11pt;font-weight:700;margin:12px 0 6px 0;">2. Spezifische Gefahren bei Glasfaserarbeiten (LWL)</h3>
        <ul style="margin:0 0 12px 0;padding-left:20px;">
          <li><strong>Unsichtbare Laserstrahlung:</strong> Glasfaserleitungen übertragen Licht im Infrarotbereich, das für das menschliche Auge unsichtbar ist, aber die Netzhaut dauerhaft zerstören kann. <strong>Niemals</strong> mit bloßem Auge, einer Lupe oder einem Mikroskop ohne Laserschutzfilter in offene Faserenden, Stecker oder aktive Ports blicken!</li>
          <li><strong>Glasfasersplitter (Mikrosplitter):</strong> Abgetrennte Glasfaserstücke sind nadelspitz, nahezu unsichtbar und können in die Haut, Augen oder über die Nahrung in den Körper eindringen.
            <ul style="margin:4px 0;padding-left:18px;">
              <li>Beim Spleißen ist stets eine dunkle Arbeitsunterlage zu verwenden.</li>
              <li>Alle Faserabfälle müssen <strong>sofort</strong> in einem fest verschließbaren, bruchsicheren <strong>Splitterbehälter</strong> entsorgt werden.</li>
              <li>Am Spleißarbeitsplatz ist das <strong>Essen, Trinken und Rauchen strengstens untersagt!</strong> Nach Abschluss der Spleißarbeiten sind die Hände gründlich zu waschen.</li>
            </ul>
          </li>
          <li><strong>Reinigungsmittel (Isopropanol):</strong> Leicht entzündlich! Behälter stets geschlossen halten, für ausreichende Belüftung sorgen und von Zündquellen fernhalten.</li>
        </ul>

        <h3 style="font-size:11pt;font-weight:700;margin:12px 0 6px 0;">3. Bohrarbeiten, Elektrik &amp; Gefahrstoffe (Asbest)</h3>
        <ul style="margin:0 0 12px 0;padding-left:20px;">
          <li><strong>Leitungsortung vor jeder Bohrung:</strong> Vor dem Ansetzen des Bohrers muss die Bohrstelle zwingend mit einem funktionsfähigen Leitungsfinder auf Strom-, Gas- und Wasserleitungen überprüft werden.</li>
          <li><strong>Verbot von Elektroarbeiten (230V/400V):</strong> Arbeiten an spannungsführenden Teilen oder das Öffnen von fremden Elektroverteilern sind strikt untersagt. Beschädigte Elektrowerkzeuge oder Kabel mit defekter Isolierung dürfen nicht weiterverwendet werden.</li>
          <li><strong>Staubarme Bearbeitung &amp; Asbestverdacht:</strong> In älteren Bestandsgebäuden (insbesondere Baujahr vor 1993) kann in Putzen, Spachtelmassen, Fliesenklebern oder Brandschutzplatten Asbest enthalten sein. Es darf nur mit <strong>aktiver Bohrstaubabsaugung</strong> gebohrt werden (max. Bohrdurchmesser 14 mm). Bei Verdacht auf asbesthaltige Bauteile (z.B. graue Faserzementplatten) sind die Arbeiten <strong>sofort einzustellen</strong> und die Projektleitung zu informieren!</li>
        </ul>

        <h3 style="font-size:11pt;font-weight:700;margin:12px 0 6px 0;">4. Sicheres Arbeiten auf Leitern (Absturzprävention)</h3>
        <ul style="margin:0 0 12px 0;padding-left:20px;">
          <li>Es dürfen ausschließlich unbeschädigte, geprüfte Leitern/Tritte (mit gültiger Prüfplakette nach DIN EN 131) verwendet werden.</li>
          <li>Leitern niemals auf unebenen Untergründen, Kisten oder direkt vor unverschlossenen Türen aufstellen (Türen im Treppenhaus ggf. sichern oder Warnschilder aufstellen).</li>
          <li>Auf Stehleitern niemals auf die obersten beiden Stufen/Sprossen treten.</li>
        </ul>

        <h3 style="font-size:11pt;font-weight:700;margin:12px 0 6px 0;">5. Allgemeine Ordnung, Sicherheit &amp; Notfallverhalten</h3>
        <ul style="margin:0 0 14px 0;padding-left:20px;">
          <li><strong>Alkohol- und Drogenverbot:</strong> Während der gesamten Arbeitszeit sowie vor Fahrtantritt gilt ein absolutes Null-Promille- und Drogenverbot.</li>
          <li><strong>Fluchtwege freihalten:</strong> Treppenhäuser und Hausflure sind Rettungswege. Werkzeugkoffer, Kabeltrommeln und Leitern sind so abzustellen, dass Bewohner jederzeit ungehindert passieren können und keine Stolperfallen entstehen.</li>
          <li><strong>Erste Hilfe &amp; Unfallmeldung:</strong> Im Montagefahrzeug muss stets ein vollständiger Verbandskasten (DIN 13157/13164) mitgeführt werden. Jeder Arbeitsunfall (auch kleinere Verletzungen) sowie jeder Sachschaden im Gebäude ist <strong>sofort</strong> der Geschäfts-/Projektleitung der Brünel Deutschland UG zu melden.</li>
          <li><strong>Notrufnummern:</strong> Feuerwehr / Rettungsdienst: <strong>112</strong> | Polizei: <strong>110</strong></li>
        </ul>

        <div style="padding:12px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;margin-bottom:20px;">
          <strong>Bestätigung der Kenntnisnahme und Sicherheitsunterweisung:</strong><br/>
          Ich bestätige hiermit durch meine Unterschrift, dass ich das vorstehende Allgemeine Sicherheitsblatt erhalten, gelesen und verstanden habe. Ich verpflichte mich, sämtliche Sicherheits- und Arbeitsschutzvorschriften bei der Ausführung meiner Tätigkeiten strikt zu befolgen.
        </div>

        <p style="margin:18px 0 30px 0;">Karben, den <strong>${signedDate}</strong></p>
        <div style="max-width:340px;">
          <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
          <div><strong>Unterschrift Mitarbeiter / Subunternehmer</strong></div>
          <div>(${partySignatureLabel})</div>
        </div>
        ${renderPageFooter('Allgemeines Sicherheitsblatt & Arbeitsschutzrichtlinie — Brünel Deutschland UG')}
      </div>
    `;
  }

  // Default / 5th Mandatory Module: DSGVO-Datenschutzerklärung & Verpflichtung auf das Datengeheimnis
  return `
    <div class="brn-contract-sheet">
      ${renderPageHeader()}
      <div style="display:inline-block;padding:3px 10px;border-radius:4px;background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;font-size:8.5pt;font-weight:800;margin-bottom:8px;">
        VERBINDLICHES PFLICHTMODUL (ANLAGE ZUM VERTRAGSWERK)
      </div>
      <h1 style="font-size:15.5pt;font-weight:800;margin:0 0 6px 0;color:#111827;">
        DSGVO-Datenschutzerklärung &amp; Verpflichtung auf das Datengeheimnis
      </h1>
      <p style="margin:0 0 16px 0;font-weight:700;color:#374151;">
        (gem. Art. 13, 14, 29, 32 Abs. 4 DSGVO sowie §§ 26, 53 Bundesdatenschutzgesetz – BDSG)
      </p>

      <p style="margin:0 0 8px 0;">Zwischen</p>
      <p style="margin:0 0 4px 0;"><strong>Brünel Deutschland UG (haftungsbeschränkt)</strong></p>
      <p style="margin:0 0 4px 0;">Ramonville Str. 28, 61184 Karben</p>
      <p style="margin:0 0 4px 0;">vertreten durch den Geschäftsführer Herrn Sam Rastegar Moghadam</p>
      <p style="margin:0 0 12px 0;color:#374151;">– nachfolgend „Verantwortlicher / Arbeitgeber“ genannt –</p>
      <p style="margin:0 0 8px 0;">und</p>
      <p style="margin:0 0 4px 0;">${partyLineDsgvo}</p>
      <p style="margin:0 0 4px 0;">wohnhaft / ansässig in: <strong>${fullAddress}</strong></p>
      <p style="margin:0 0 16px 0;color:#374151;">– nachfolgend „Beschäftigter / Verpflichteter“ genannt –</p>

      <h3 style="font-size:11pt;font-weight:700;margin:14px 0 6px 0;">§ 1 Zweck und Rechtsgrundlage der Datenverarbeitung (§ 26 BDSG, Art. 6 DSGVO)</h3>
      <p style="margin:0 0 10px 0;text-align:justify;">
        Die Brünel Deutschland UG (haftungsbeschränkt) verarbeitet personenbezogene Daten des Beschäftigten zum Zwecke der Begründung, Durchführung, Steuerung, Abrechnung und Beendigung des Vertragsverhältnisses (Arbeits-, Praktikums- oder Werkvertrag) gemäß Art. 6 Abs. 1 lit. b, c und f DSGVO in Verbindung mit § 26 Abs. 1 BDSG. Hierzu zählt auch die digitale Verwaltung der Personal- und Einsatzakte im unternehmenseigenen ERP- und Mitarbeiterportal (<code>app.bruenel.de</code>).
      </p>

      <h3 style="font-size:11pt;font-weight:700;margin:14px 0 6px 0;">§ 2 Kategorien verarbeiteter Beschäftigten- und Einsatzdaten</h3>
      <p style="margin:0 0 6px 0;text-align:justify;">Im Rahmen des Vertragsverhältnisses werden insbesondere folgende Datenkategorien verarbeitet:</p>
      <ol style="margin:0 0 10px 0;padding-left:20px;text-align:justify;">
        <li style="margin-bottom:4px;"><strong>Stamm- &amp; Identifikationsdaten:</strong> Vor- und Nachname, Geburtsdatum, Staatsangehörigkeit, Anschrift, Telefonnummer, E-Mail-Adresse, Ausweis-/Aufenthaltstiteldaten, Führerscheindaten sowie Notfallkontaktdaten (SOS-Kontakt gem. DGUV).</li>
        <li style="margin-bottom:4px;"><strong>Lohn-, Steuer- &amp; Sozialversicherungsdaten:</strong> Steuer-Identifikationsnummer (IdNr.), Steuerklasse, Krankenkasse, Sozialversicherungsnummer, Bankverbindung (IBAN/BIC), Bruttogehalt/Stücklohn sowie bei Nachunternehmern Gewerbeanmeldung, USt-IdNr., Freistellungsbescheinigung nach § 48b EStG und BG-BAU-Nachweise.</li>
        <li style="margin-bottom:4px;"><strong>Arbeitszeit-, Abwesenheits- &amp; Projektdaten:</strong> Digitale Arbeitszeiterfassung (Check-In / Check-Out / Pausen inkl. projektbezogenem Standortnachweis bei Schichtbeginn), Urlaubsanträge, Arbeitsunfähigkeitsmeldungen (eAU), Fahrzeug- und Werkzeugzuweisungen sowie Leistungs- und Abnahmeprotokolle im Glasfaserausbau (NE3/NE4).</li>
      </ol>

      <h3 style="font-size:11pt;font-weight:700;margin:14px 0 6px 0;">§ 3 Verpflichtung auf die Vertraulichkeit und das Datengeheimnis (Art. 29, 32 Abs. 4 DSGVO, § 53 BDSG)</h3>
      <ol style="margin:0 0 10px 0;padding-left:20px;text-align:justify;">
        <li style="margin-bottom:5px;">Dem Verpflichteten ist es strengstens untersagt, personenbezogene Daten unbefugt zu erheben, zu verarbeiten, einzusehen, zu verändern, weiterzugeben oder für fremde bzw. private Zwecke zu nutzen.</li>
        <li style="margin-bottom:5px;"><strong>Besonderer Schutz von Kunden-, Eigentümer- und Bewohnerdaten (Glasfaser-/IT-Projekte):</strong> Im Rahmen der Bautätigkeiten (insb. NE4-Hausbegehungen, Wohnungsmontagen, TA-Dosen-Installation und Spleißdokumentation) erhält der Verpflichtete Zugang zu Namen, Adressen, Haus-IDs, Telefonnummern und Wohnräumen von Hausbewohnern und Auftraggebern.
          <ul style="margin:4px 0;padding-left:18px;">
            <li>Fotoaufnahmen zur Abnahmedokumentation dürfen ausschließlich das technische Gewerk (Kabelkanal, AP, Spleißkassette, TA-Dose mit Label) zeigen – niemals Personen, private Dokumente oder persönliche Gegenstände der Bewohner.</li>
            <li>Teilnehmerlisten, Begehungsprotokolle und Objektpläne dürfen nicht an unbefugte Dritte weitergegeben oder privat gespeichert werden.</li>
          </ul>
        </li>
        <li style="margin-bottom:5px;">Diese Verpflichtung auf das Datengeheimnis besteht ohne zeitliche Begrenzung auch nach Beendigung des Vertragsverhältnisses fort.</li>
      </ol>

      <h3 style="font-size:11pt;font-weight:700;margin:14px 0 6px 0;">§ 4 IT-Sicherheit, Nutzung des Mitarbeiterportals &amp; Meldepflicht bei Datenpannen</h3>
      <ol style="margin:0 0 10px 0;padding-left:20px;text-align:justify;">
        <li style="margin-bottom:5px;">Persönliche Zugangsdaten (Login, Einmalpasswort/OTP, Passwörter) zum Brünel-System sind streng geheim zu halten und dürfen keinesfalls an Dritte weitergegeben werden.</li>
        <li style="margin-bottom:5px;">Ein Verlust dienstlicher Endgeräte, Unterlagen oder der Verdacht auf einen Datenschutzverstoß (Datenpanne gem. Art. 33 DSGVO) ist der Geschäftsführung <strong>unverzüglich (binnen maximal 24 Stunden)</strong> zu melden.</li>
      </ol>

      <h3 style="font-size:11pt;font-weight:700;margin:14px 0 6px 0;">§ 5 Empfänger, Speicherdauer und Betroffenenrechte (Art. 15–21, 77 DSGVO)</h3>
      <ol style="margin:0 0 12px 0;padding-left:20px;text-align:justify;">
        <li style="margin-bottom:5px;">Eine Übermittlung von Beschäftigtendaten erfolgt ausschließlich im gesetzlich vorgeschriebenen Rahmen (Finanzamt/ELStAM, Sozialversicherungsträger, Berufsgenossenschaft, Lohnbuchhaltung, Bankinstitute sowie an Hauptauftraggeber zum Nachweis eingesetzter Fachkräfte).</li>
        <li style="margin-bottom:5px;">Nach Beendigung des Vertragsverhältnisses werden die Daten nach Ablauf der gesetzlichen steuer- und handelsrechtlichen Aufbewahrungsfristen (in der Regel 6 bis 10 Jahre gem. § 147 AO, § 257 HGB) gelöscht.</li>
        <li style="margin-bottom:5px;">Der Beschäftigte hat jederzeit das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) sowie ein Beschwerderecht bei der zuständigen Datenschutz-Aufsichtsbehörde (Der Hessische Beauftragte für Datenschutz und Informationsfreiheit – HBDI).</li>
      </ol>

      <div style="padding:12px 14px;border:1px solid #6ee7b7;border-radius:8px;background:#ecfdf5;margin-bottom:20px;font-size:9.8pt;">
        <strong>Erklärung, Einwilligung &amp; Empfangsbekenntnis:</strong><br/>
        Ich habe die vorstehende DSGVO-Datenschutzerklärung zur Verarbeitung meiner personenbezogenen Daten zur Kenntnis genommen. Gleichzeitig verpflichte ich mich hiermit verbindlich zur Wahrung des Datengeheimnisses und der Vertraulichkeit gemäß Art. 29, 32 Abs. 4 DSGVO und § 53 BDSG. Ich wurde darauf hingewiesen, dass Verstöße gegen datenschutzrechtliche Vorschriften nach Art. 83 DSGVO sowie § 42 BDSG mit Geldbußen oder Freiheits-/Geldstrafe geahndet werden können. Eine Ausfertigung dieser Erklärung wird mir nach Unterzeichnung in meinem persönlichen Dokumentenbereich bereitgestellt.
      </div>

      <p style="margin:18px 0 30px 0;">Karben, den <strong>${signedDate}</strong></p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:30px;">
        <div>
          <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
          <div><strong>Verantwortlicher / Arbeitgeber</strong></div>
          <div>Brünel Deutschland UG (haftungsbeschränkt)</div>
          <div>Sam Rastegar Moghadam</div>
        </div>
        <div>
          <div style="border-bottom:1px solid #111827;height:36px;margin-bottom:8px;"></div>
          <div><strong>Beschäftigter / Verpflichteter</strong></div>
          <div>(${partySignatureLabel})</div>
        </div>
      </div>
      ${renderPageFooter('5. Pflichtmodul: DSGVO-Datenschutzerklärung & Datengeheimnis — Brünel Deutschland UG')}
    </div>
  `;
}

// Helper to build a clean safe PDF filename per contract
function buildSafePdfFilename(rawTitle, employeeName = '') {
  const base = `${rawTitle || 'Vertrag'}${employeeName ? `_${employeeName}` : ''}`
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `${base.slice(0, 110) || 'Vertrag'}.pdf`;
}

// Helper to download a single contract directly as an individual .pdf file
export async function downloadSingleContractPdf(title, htmlContent, customFileName = '') {
  if (!htmlContent) return;
  const filename = customFileName
    ? (customFileName.toLowerCase().endsWith('.pdf') ? customFileName : `${customFileName}.pdf`)
    : buildSafePdfFilename(title);

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-99999px';
  wrapper.style.top = '0';
  wrapper.style.width = '180mm';
  wrapper.style.background = '#ffffff';
  wrapper.style.color = '#111827';
  wrapper.style.fontFamily = "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif";
  wrapper.style.fontSize = '10.5pt';
  wrapper.style.lineHeight = '1.55';
  wrapper.innerHTML = htmlContent;
  document.body.appendChild(wrapper);

  try {
    const opt = {
      margin: [14, 15, 14, 15],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], before: '.page-break' },
    };
    await html2pdf().set(opt).from(wrapper).save();
  } catch (err) {
    console.error('PDF export error, falling back to print dialog:', err);
    openContractPrintPdfWindow(title, [htmlContent]);
  } finally {
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  }
}

// Helper to download multiple contracts as SEPARATE individual .pdf files (never merged into a single PDF)
export async function downloadContractsAsSeparatePdfs(contractsList = [], employeeName = '') {
  if (!Array.isArray(contractsList) || contractsList.length === 0) return;
  for (let i = 0; i < contractsList.length; i++) {
    const item = contractsList[i];
    const title = item.title || item.contract_type || item.contract_code || `Vertrag_${i + 1}`;
    const html = item.html_content || item.html || '';
    if (!html) continue;
    const fileName = buildSafePdfFilename(title, employeeName && !title.includes(employeeName) ? employeeName : '');
    await downloadSingleContractPdf(title, html, fileName);
    if (i < contractsList.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
}

// Helper to open clean A4 Print / Save as PDF window for a single document
export function openContractPrintPdfWindow(title, htmlArray) {
  const win = window.open('', '_blank', 'width=980,height=900');
  if (!win) {
    alert('Bitte erlauben Sie Pop-ups in Ihrem Browser, um den Vertrag als PDF zu speichern oder zu drucken.');
    return;
  }
  const combinedHtml = htmlArray
    .map((h, idx) => (idx > 0 ? `<div class="page-break" style="page-break-before:always;margin-top:32px;"></div>${h}` : h))
    .join('\n');

  win.document.write(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 18mm 18mm 18mm 18mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
      color: #111827;
      line-height: 1.55;
      font-size: 10.5pt;
      margin: 0;
      padding: 24px;
      background: #f1f5f9;
    }
    .print-toolbar {
      max-width: 210mm;
      margin: 0 auto 16px auto;
      padding: 12px 18px;
      background: #0f172a;
      color: #fff;
      border-radius: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .print-btn {
      background: #FF6B00;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }
    .paper-container {
      max-width: 210mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 20mm;
      box-shadow: 0 8px 30px rgba(15,23,42,0.12);
      border-radius: 4px;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .print-toolbar { display: none !important; }
      .paper-container { box-shadow: none; padding: 0; max-width: 100%; }
      .page-break { page-break-before: always; border: none !important; margin: 0 !important; padding: 0 !important; }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <div>
      <strong style="font-size:14px;">📄 ${title}</strong>
      <div style="font-size:11.5px;color:#cbd5e1;">Wählen Sie im Druckdialog „Als PDF sichern / Save as PDF“, um das offizielle Vertragsdokument als PDF herunterzuladen.</div>
    </div>
    <button class="print-btn" onclick="window.print()">🖨️ Als PDF speichern / Drucken</button>
  </div>
  <div class="paper-container">
    ${combinedHtml}
  </div>
  <script>
    setTimeout(() => { window.focus(); window.print(); }, 350);
  </script>
</body>
</html>`);
  win.document.close();
}

// ==============================================================================
// COMPONENT 1: HR CONTRACT GENERATOR & CONTRACTS OVERVIEW PER MITARBEITER
// ==============================================================================
export const HRContractGeneratorView = ({
  employees = [],
  onReload,
  onRefreshEmployees,
  onOpenEmployeeModal,
  onOpenEmployee,
  onOpenCreateEmployeeModal,
  preselectedEmpId = '',
  initialEmpId = '',
}) => {
  const effectiveReload = onReload || onRefreshEmployees;
  const effectiveOpenEmpModal = onOpenEmployeeModal || onOpenEmployee;
  const effectivePreselectedId = preselectedEmpId || initialEmpId || '';

  const todayIso = new Date().toISOString().slice(0, 10);
  const nextMonthFirstIso = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const [selectedEmpId, setSelectedEmpId] = useState(effectivePreselectedId || employees[0]?.id || '');
  const [selectedCodes, setSelectedCodes] = useState(['ARBEITSVERTRAG', 'DSGVO']);
  const [activePreviewCode, setActivePreviewCode] = useState('ARBEITSVERTRAG');
  const [vehicles, setVehicles] = useState([]);
  const [contractsList, setContractsList] = useState([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueSuccessBanner, setIssueSuccessBanner] = useState(null);
  const [uploadingSignedId, setUploadingSignedId] = useState(null);
  const [contractFilterEmpId, setContractFilterEmpId] = useState('ALL');
  const [contractFilterStatus, setContractFilterStatus] = useState('ALL');
  const [contractSearch, setContractSearch] = useState('');
  const [editingIssuedContract, setEditingIssuedContract] = useState(null);
  const [onboardingEmailModal, setOnboardingEmailModal] = useState(null);
  const [emailSentPopup, setEmailSentPopup] = useState(null);
  const [sendingOnboardingEmpId, setSendingOnboardingEmpId] = useState(null);
  const [copiedOnboardingText, setCopiedOnboardingText] = useState(false);
  const [showGeneratorModal, setShowGeneratorModal] = useState(Boolean(effectivePreselectedId));
  const [contractsViewMode, setContractsViewMode] = useState('BOTH');

  const openGeneratorForEmployee = (empId) => {
    if (empId) {
      setSelectedEmpId(empId);
    } else if (!selectedEmpId && employees[0]?.id) {
      setSelectedEmpId(employees[0].id);
    }
    setShowGeneratorModal(true);
  };

  const [conditions, setConditions] = useState({
    salutation: 'Herr',
    first_name: '',
    last_name: '',
    birth_date: '',
    street: '',
    postal_code: '',
    city: '',
    role: 'Projektleiter',
    employment_type: 'Full-time',
    contract_model: 'Unbefristet (Vollzeit 40h)',
    signed_date: todayIso,
    contract_start_date: nextMonthFirstIso,
    probezeit_months: 6,
    probezeit_end_date: addMonthsIso(nextMonthFirstIso, 6),
    weekly_hours: 40,
    base_salary: 3600,
    statutory_leave_days: 20,
    extra_leave_days: 4,
    annual_leave_days: 24,
    praktikum_start_date: todayIso,
    praktikum_end_date: addMonthsIso(todayIso, 0) || todayIso,
    vehicle_id: '',
    vehicle_model: '',
    vehicle_plate: '',
    vehicle_vin: '',
    vehicle_mileage: '',
    vehicle_tuv: '',
    vehicle_condition: 'ok',
    vehicle_defects: 'Keine sichtbaren Schäden / Mängel bei Übergabe festgestellt.',
    vehicle_keys_count: '2',
    vehicle_fuel_card: 'DKV / Shell Tankkarte',
    vehicle_extra_accessories: 'Spleißkoffer & PSA-Ausstattung',
    company_name: '',
    sub_location: '77704 Oberkirch',
    sub_radius_km: '50',
    sub_rate_variante_a: 40.0,
    sub_rate_variante_b: 35.0,
    sub_payment_term_days: '30',
  });

  // Per-contract live editable HTML map: { ARBEITSVERTRAG: '...', DSGVO: '...' }
  const [draftHtmlMap, setDraftHtmlMap] = useState({});
  const [manuallyEditedCodes, setManuallyEditedCodes] = useState({});
  const editorRef = useRef(null);

  const selectedEmp = useMemo(
    () => employees.find((e) => String(e.id) === String(selectedEmpId)) || null,
    [employees, selectedEmpId]
  );

  const loadContractsAndFleet = () => {
    setLoadingContracts(true);
    fetchWithToken('/api/v1/hr/contracts')
      .then((res) => setContractsList(Array.isArray(res) ? res : []))
      .catch(() => setContractsList([]))
      .finally(() => setLoadingContracts(false));

    fetchWithToken('/api/v1/fleet/vehicles')
      .then((res) => setVehicles(Array.isArray(res) ? res : []))
      .catch(() => setVehicles([]));
  };

  useEffect(() => {
    loadContractsAndFleet();
  }, []);

  useEffect(() => {
    if (effectivePreselectedId) {
      setSelectedEmpId(effectivePreselectedId);
    } else if (!selectedEmpId && employees.length > 0) {
      setSelectedEmpId(employees[0].id);
    }
  }, [effectivePreselectedId, employees]);

  // Populate conditions whenever selected employee changes
  useEffect(() => {
    if (!selectedEmp) return;
    const attr = selectedEmp.attributes || {};
    const startD = attr.contract_start_date || nextMonthFirstIso;
    const pMonths = Number(attr.probezeit_months ?? 6);
    const pEnd = attr.probezeit_end_date || addMonthsIso(startD, pMonths);

    // Compute default 1-week Praktikum dates
    const pkStart = attr.praktikum_start_date || todayIso;
    const pkEndDateObj = new Date(`${pkStart}T12:00:00`);
    if (!isNaN(pkEndDateObj.getTime())) pkEndDateObj.setDate(pkEndDateObj.getDate() + 6);
    const pkEnd = attr.praktikum_end_date || (!isNaN(pkEndDateObj.getTime()) ? pkEndDateObj.toISOString().slice(0, 10) : todayIso);

    // Check if employee has an assigned vehicle
    const assignedVeh = vehicles.find(
      (v) => v.assigned_team_lead_id === selectedEmp.id || v.id === attr.assigned_vehicle_id
    );

    const empType = selectedEmp.employment_type || 'Full-time';
    let defaultCodes = ['ARBEITSVERTRAG', 'DSGVO'];
    if (empType === 'Subunternehmer' || empType === 'Freelancer') {
      defaultCodes = ['SUBUNTERNEHMER', 'DSGVO'];
    }

    setSelectedCodes((prev) => {
      const withDsgvo = Array.from(new Set([...(prev.length ? prev : defaultCodes), 'DSGVO']));
      return withDsgvo;
    });

    const nextCond = {
      ...conditions,
      salutation: attr.salutation || attr.anrede || (empType === 'Subunternehmer' && attr.company_name ? 'Firma' : 'Herr'),
      first_name: selectedEmp.first_name || '',
      last_name: selectedEmp.last_name || '',
      portal_email: selectedEmp.email || '',
      private_email: attr.private_email || (selectedEmp.email && !String(selectedEmp.email).toLowerCase().endsWith('@bruenel.de') ? selectedEmp.email : ''),
      birth_date: attr.birth_date || attr.geburtsdatum || '',
      street: attr.street || attr.strasse || '',
      postal_code: attr.postal_code || attr.plz || '',
      city: attr.city || attr.ort || '',
      role: selectedEmp.role || 'Projektleiter',
      employment_type: empType,
      contract_model: attr.contract_model || 'Unbefristet (Vollzeit 40h)',
      signed_date: todayIso,
      contract_start_date: startD,
      probezeit_months: pMonths,
      probezeit_end_date: pEnd,
      weekly_hours: attr.weekly_hours ?? 40,
      base_salary: selectedEmp.base_salary && selectedEmp.base_salary > 0 ? selectedEmp.base_salary : 3600,
      statutory_leave_days: attr.statutory_leave_days ?? 20,
      extra_leave_days: attr.extra_leave_days ?? 4,
      annual_leave_days: (attr.statutory_leave_days ?? 20) + (attr.extra_leave_days ?? 4),
      praktikum_start_date: pkStart,
      praktikum_end_date: pkEnd,
      vehicle_id: assignedVeh?.id || attr.assigned_vehicle_id || '',
      vehicle_model: assignedVeh?.model || attr.assigned_vehicle_model || '',
      vehicle_plate: assignedVeh?.plate_number || attr.assigned_vehicle_plate || '',
      vehicle_vin: assignedVeh?.vin || attr.assigned_vehicle_vin || '',
      vehicle_mileage: assignedVeh?.mileage_km ?? attr.assigned_vehicle_km ?? '',
      vehicle_tuv: assignedVeh?.next_inspection_date || '',
      company_name: attr.company_name || `${selectedEmp.first_name || ''} ${selectedEmp.last_name || ''}`.trim(),
      sub_location: attr.sub_location || '77704 Oberkirch',
      sub_rate_variante_a: attr.sub_rate_variante_a ?? 40.0,
      sub_rate_variante_b: attr.sub_rate_variante_b ?? 35.0,
    };
    setConditions(nextCond);
    setManuallyEditedCodes({});
  }, [selectedEmpId, selectedEmp?.id, vehicles.length]);

  // Regenerate draft HTML for any non-manually-edited contract whenever conditions or selectedCodes change
  useEffect(() => {
    setDraftHtmlMap((prev) => {
      const next = { ...prev };
      for (const item of CONTRACT_CATALOG) {
        if (!manuallyEditedCodes[item.code] || !next[item.code]) {
          next[item.code] = generateContractHtml(item.code, selectedEmp, conditions);
        }
      }
      return next;
    });
  }, [conditions, selectedEmp]);

  const toggleContractCode = (code) => {
    if (code === 'DSGVO') return; // Mandatory 5th contract is always selected
    setSelectedCodes((prev) => {
      const exists = prev.includes(code);
      const next = exists ? prev.filter((c) => c !== code) : [...prev, code];
      if (!next.includes('DSGVO')) next.push('DSGVO');
      if (!next.includes(activePreviewCode)) {
        setActivePreviewCode(next[0] || 'DSGVO');
      }
      return next;
    });
    if (!selectedCodes.includes(code)) {
      setActivePreviewCode(code);
    }
  };

  const updateCond = (key, val) => {
    setConditions((prev) => {
      const next = { ...prev, [key]: val };
      if (key === 'contract_start_date') {
        next.probezeit_end_date = addMonthsIso(val, next.probezeit_months ?? 6);
      }
      if (key === 'probezeit_months') {
        next.probezeit_end_date = addMonthsIso(next.contract_start_date, val);
      }
      if (key === 'statutory_leave_days' || key === 'extra_leave_days') {
        next.annual_leave_days = Number(next.statutory_leave_days || 0) + Number(next.extra_leave_days || 0);
      }
      return next;
    });
  };

  const handleSelectFleetVehicle = (vehId) => {
    const v = vehicles.find((x) => String(x.id) === String(vehId));
    if (!v) {
      updateCond('vehicle_id', '');
      return;
    }
    setConditions((prev) => ({
      ...prev,
      vehicle_id: v.id,
      vehicle_model: v.model || '',
      vehicle_plate: v.plate_number || '',
      vehicle_vin: v.vin || '',
      vehicle_mileage: v.mileage_km ?? '',
      vehicle_tuv: v.next_inspection_date || '',
    }));
  };

  const handleResetTemplateText = (code) => {
    const fresh = generateContractHtml(code, selectedEmp, conditions);
    setDraftHtmlMap((prev) => ({ ...prev, [code]: fresh }));
    setManuallyEditedCodes((prev) => ({ ...prev, [code]: false }));
    if (editorRef.current && activePreviewCode === code) {
      editorRef.current.innerHTML = fresh;
    }
  };

  const handleIssueSelectedContracts = async () => {
    if (!selectedEmpId || !selectedEmp) {
      alert('Bitte wählen Sie zuerst einen registrierten Mitarbeiter aus.');
      return;
    }
    // Sync current editor innerHTML if open
    const currentMap = { ...draftHtmlMap };
    if (editorRef.current && activePreviewCode) {
      currentMap[activePreviewCode] = editorRef.current.innerHTML;
    }

    const orderedSelected = CONTRACT_CATALOG.filter((c) => selectedCodes.includes(c.code) || c.mandatory);
    const contractsPayload = orderedSelected.map((c) => ({
      contract_code: c.code,
      contract_type: c.title,
      title: `${c.title} — ${conditions.first_name || selectedEmp.first_name} ${conditions.last_name || selectedEmp.last_name}`,
      is_mandatory_dsgvo: c.mandatory,
      html_content: currentMap[c.code] || generateContractHtml(c.code, selectedEmp, conditions),
    }));

    setIssuing(true);
    setIssueSuccessBanner(null);
    try {
      const res = await fetchWithToken('/api/v1/hr/contracts/issue', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: selectedEmpId,
          conditions,
          contracts: contractsPayload,
        }),
      });
      const empDisplayName = `${conditions.first_name || selectedEmp.first_name} ${conditions.last_name || selectedEmp.last_name}`.trim();
      const issuedContracts = res.contracts || [];
      setIssueSuccessBanner({
        employeeName: empDisplayName,
        count: issuedContracts.length,
        contracts: issuedContracts,
      });
      loadContractsAndFleet();
      if (effectiveReload) effectiveReload();
      // Automatically export each issued contract as its own separate PDF file
      if (issuedContracts.length > 0) {
        downloadContractsAsSeparatePdfs(issuedContracts, empDisplayName);
      }
    } catch (err) {
      alert(`Fehler beim Ausstellen der Verträge: ${err.message}`);
    } finally {
      setIssuing(false);
    }
  };

  const handleUploadSignedContract = async (contractObj, file) => {
    if (!file || !contractObj) return;
    setUploadingSignedId(contractObj.id);
    try {
      const up = await uploadMediaFile({
        file,
        referenceType: 'Arbeitsvertrag / Werkvertrag',
        referenceId: contractObj.employee_id,
        employeeId: contractObj.employee_id,
        title: `${contractObj.title} (Unterschrieben)`,
        metadata: {
          category: 'Arbeitsvertrag / Werkvertrag',
          doc_date: new Date().toISOString().slice(0, 10),
          uploaded_by: 'Management',
          is_hr_contract: true,
          visibility: 'employee_visible',
          employee_visible: true,
          contract_status: 'Signed',
        },
      });
      const signedRes = await fetchWithToken(`/api/v1/hr/contracts/${contractObj.id}/upload-signed`, {
        method: 'POST',
        body: JSON.stringify({
          signed_document_id: up.document_id,
        }),
      });
      await loadContractsAndFleet();
      if (effectiveReload) effectiveReload();
      // Do NOT send the email automatically on each contract upload!
      // Once ALL contracts for this employee are signed & uploaded, open the preview modal
      // so the user can click "Willkommens-E-Mail jetzt senden" once at the end.
      if (signedRes?.all_contracts_signed && !signedRes?.onboarding_email_already_sent && contractObj.employee_id) {
        await handleTriggerOnboardingEmail(
          contractObj.employee_id,
          false,
          `${signedRes.signed_contracts_count || 1} Verträge unterschrieben`,
          undefined,
          false
        );
      }
    } catch (err) {
      alert(`Fehler beim Hochladen des unterschriebenen Vertrags: ${err.message}`);
    } finally {
      setUploadingSignedId(null);
    }
  };

  const handleTriggerOnboardingEmail = async (
    empId,
    regenerateOtp = false,
    contractTitle = '',
    overridePrivateEmail = undefined,
    closeModalOnSend = false
  ) => {
    if (!empId) return;
    setSendingOnboardingEmpId(empId);
    try {
      const res = await fetchWithToken(`/api/v1/hr/employees/${empId}/send-onboarding-email`, {
        method: 'POST',
        body: JSON.stringify({
          regenerate_otp: regenerateOtp,
          contract_title: contractTitle,
          preview_only: !closeModalOnSend,
          ...(overridePrivateEmail !== undefined ? { private_email: overridePrivateEmail } : {}),
        }),
      });
      if (effectiveReload) effectiveReload();
      if (closeModalOnSend) {
        if (res.sent_via_smtp) {
          setOnboardingEmailModal(null);
          setEmailSentPopup({
            employeeName: res.employee_name,
            toEmail: res.to_email || res.private_email,
            username: res.username,
            otp: res.otp,
            portalUrl: res.portal_url || 'https://www.bruenel.de/de#login',
            note: res.smtp_note,
          });
        } else {
          alert(res.smtp_note || 'E-Mail konnte nicht gesendet werden. Bitte prüfen Sie die private E-Mail-Adresse.');
          setOnboardingEmailModal({
            ...res,
            employee_id: empId,
            contract_title: contractTitle,
          });
        }
      } else {
        setOnboardingEmailModal({
          ...res,
          employee_id: empId,
          contract_title: contractTitle,
        });
      }
    } catch (err) {
      alert(`Fehler beim Erstellen/Senden der Willkommens-E-Mail: ${err.message}`);
    } finally {
      setSendingOnboardingEmpId(null);
    }
  };

  const handleDeleteContract = async (contractObj) => {
    if (!window.confirm(`Vertrag „${contractObj.title}“ wirklich löschen?`)) return;
    try {
      await fetchWithToken(`/api/v1/hr/contracts/${contractObj.id}`, { method: 'DELETE' });
      loadContractsAndFleet();
      if (effectiveReload) effectiveReload();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveEditedIssuedContract = async () => {
    if (!editingIssuedContract) return;
    try {
      await fetchWithToken(`/api/v1/hr/contracts/${editingIssuedContract.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editingIssuedContract.title,
          html_content: editingIssuedContract.html_content,
        }),
      });
      setEditingIssuedContract(null);
      loadContractsAndFleet();
      if (effectiveReload) effectiveReload();
    } catch (err) {
      alert(err.message);
    }
  };

  // Filtered flat list of contracts
  const filteredContractsList = useMemo(() => {
    const q = contractSearch.trim().toLowerCase();
    return contractsList.filter((c) => {
      if (contractFilterEmpId !== 'ALL' && String(c.employee_id) !== String(contractFilterEmpId)) return false;
      if (contractFilterStatus === 'PENDING' && c.status !== 'Pending_Signature') return false;
      if (contractFilterStatus === 'SIGNED' && c.status !== 'Signed') return false;
      if (contractFilterStatus === 'NONE') return false;
      if (q) {
        const hay = `${c.employee_name || ''} ${c.title || ''} ${c.contract_type || ''} ${c.employee_number || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contractsList, contractFilterEmpId, contractFilterStatus, contractSearch]);

  // Group contracts by employee for the Contracts Overview section (separated for each Mitarbeiter)
  const groupedByEmployee = useMemo(() => {
    const q = contractSearch.trim().toLowerCase();
    const map = new Map();

    // First populate from filtered contracts
    for (const c of filteredContractsList) {
      const eid = c.employee_id || 'unknown';
      if (!map.has(eid)) {
        const empObj = employees.find((e) => String(e.id) === String(eid));
        map.set(eid, {
          employee_id: eid,
          employee_name: empObj?.full_name || c.employee_name || 'Mitarbeiter',
          employee_number: empObj?.employee_number || c.employee_number || '—',
          role: empObj?.role || c.employee_role || '—',
          employment_type: empObj?.employment_type || c.employment_type || '—',
          base_salary: empObj?.base_salary || 0,
          attributes: empObj?.attributes || {},
          empObj,
          contracts: [],
        });
      }
      map.get(eid).contracts.push(c);
    }

    // Also include registered employees so each Mitarbeiter has their own separated section
    if (contractFilterStatus === 'ALL' || contractFilterStatus === 'NONE') {
      for (const empObj of employees) {
        if (contractFilterEmpId !== 'ALL' && String(empObj.id) !== String(contractFilterEmpId)) continue;
        const empHasAnyContract = contractsList.some((c) => String(c.employee_id) === String(empObj.id));
        if (contractFilterStatus === 'NONE' && empHasAnyContract) continue;
        if (!map.has(empObj.id)) {
          if (q) {
            const hay = `${empObj.full_name || ''} ${empObj.employee_number || ''} ${empObj.role || ''} ${empObj.employment_type || ''}`.toLowerCase();
            if (!hay.includes(q)) continue;
          }
          if (contractFilterStatus === 'ALL' && empHasAnyContract) continue;
          map.set(empObj.id, {
            employee_id: empObj.id,
            employee_name: empObj.full_name || `${empObj.first_name || ''} ${empObj.last_name || ''}`.trim() || 'Mitarbeiter',
            employee_number: empObj.employee_number || '—',
            role: empObj.role || '—',
            employment_type: empObj.employment_type || '—',
            base_salary: empObj.base_salary || 0,
            attributes: empObj.attributes || {},
            empObj,
            contracts: [],
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.contracts.length - a.contracts.length);
  }, [filteredContractsList, contractsList, employees, contractFilterEmpId, contractFilterStatus, contractSearch]);

  const pendingTotal = contractsList.filter((c) => c.status === 'Pending_Signature').length;
  const signedTotal = contractsList.filter((c) => c.status === 'Signed').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Workflow Explanation, KPI Banner & Generate Contract Button */}
      <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: 12, background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ padding: '3px 9px', borderRadius: 6, background: '#FF6B00', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                ARBEITSRECHT &amp; DSGVO KONFORM
              </span>
              <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800, color: '#fff' }}>
                Vertragsübersicht &amp; HR Vertragsgenerator (5 Vertragsmodule)
              </h3>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#cbd5e1', maxWidth: 820 }}>
              Übersicht aller Verträge und deren Status (<strong>Ausstehend</strong> vs. <strong>Unterschrieben / Abgeschlossen</strong>), getrennt nach Mitarbeiter sowie als Gesamtliste. Klicken Sie auf <strong>„+ Vertrag generieren“</strong>, um im internen Generator-Fenster neue Verträge für einen Mitarbeiter zu erstellen.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 700 }}>VERTRÄGE GESAMT</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{contractsList.length}</div>
            </div>
            <div style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.4)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#fde68a', fontWeight: 700 }}>AUSSTEHEND (INTERN)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24' }}>{pendingTotal}</div>
            </div>
            <div style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.4)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#a7f3d0', fontWeight: 700 }}>UNTERSCHRIEBEN (AKTIV)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#34d399' }}>{signedTotal}</div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => openGeneratorForEmployee(selectedEmpId || employees[0]?.id)}
              style={{
                padding: '12px 18px',
                fontSize: 13.5,
                fontWeight: 800,
                background: 'linear-gradient(135deg, #FF6B00 0%, #ea580c 100%)',
                border: '1px solid #fb923c',
                borderRadius: 10,
                boxShadow: '0 8px 20px rgba(255,107,0,0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <Plus size={16} /> Vertrag generieren (Generate Contract)
            </button>
          </div>
        </div>
      </div>

      {issueSuccessBanner && (
        <div style={{ padding: '14px 18px', borderRadius: 12, background: '#ecfdf5', border: '1.5px solid #10b981', color: '#065f46', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={18} style={{ color: '#059669' }} />
              {issueSuccessBanner.count} Verträge für {issueSuccessBanner.employeeName} erfolgreich ausgestellt &amp; Personalakte synchronisiert!
            </div>
            <div style={{ fontSize: 12, marginTop: 4, color: '#047857' }}>
              • Startdatum, Probezeit-Ende, Gehalt und Praktikumsdaten wurden im Mitarbeiterprofil aktualisiert.<br />
              • Die Verträge sind im Mitarbeiterprofil als <strong>„Ausstehend (Pending Signature)“</strong> hinterlegt und für den Mitarbeiter im Portal <strong>noch gesperrt (nicht sichtbar)</strong>, bis Sie unten das unterschriebene PDF hochladen.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {(issueSuccessBanner.contracts || []).map((c, idx) => (
              <button
                key={c.id || idx}
                type="button"
                className="btn-secondary btn-sm"
                style={{ borderColor: '#059669', color: '#065f46', background: '#ffffff', fontWeight: 700, fontSize: 11.5 }}
                onClick={() => downloadSingleContractPdf(c.title, c.html_content)}
              >
                <Download size={12} /> PDF {idx + 1}: {c.contract_code || 'Vertrag'}
              </button>
            ))}
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() =>
                downloadContractsAsSeparatePdfs(
                  issueSuccessBanner.contracts,
                  issueSuccessBanner.employeeName
                )
              }
            >
              <Download size={14} /> Alle {issueSuccessBanner.count} Verträge als separate PDF-Dateien speichern
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setIssueSuccessBanner(null)}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          FILTER, SEARCH & VIEW MODE TOOLBAR
         ===================================================================== */}
      <div className="glass-panel" style={{ padding: '12px 16px', borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { id: 'BOTH', label: '📋 Beide Ansichten (Nach Mitarbeiter & Gesamtliste)' },
            { id: 'BY_EMPLOYEE', label: `👥 Getrennt nach Mitarbeiter (${groupedByEmployee.length})` },
            { id: 'FLAT_LIST', label: `📄 Alle Verträge — Listenansicht (${filteredContractsList.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setContractsViewMode(tab.id)}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                border: contractsViewMode === tab.id ? '1.5px solid #FF6B00' : '1px solid #cbd5e1',
                background: contractsViewMode === tab.id ? '#fff7ed' : '#f8fafc',
                color: contractsViewMode === tab.id ? '#9a3412' : '#334155',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Suchen (Mitarbeiter, Vertrag, Typ)..."
            value={contractSearch}
            onChange={(e) => setContractSearch(e.target.value)}
            style={{ width: 220, fontSize: 12 }}
          />
          <select value={contractFilterEmpId} onChange={(e) => setContractFilterEmpId(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
            <option value="ALL">Alle Mitarbeiter ({employees.length})</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
          <select value={contractFilterStatus} onChange={(e) => setContractFilterStatus(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
            <option value="ALL">Status: Alle ({contractsList.length})</option>
            <option value="PENDING">🟠 Ausstehend / Nicht unterschrieben ({pendingTotal})</option>
            <option value="SIGNED">🟢 Unterschrieben / Abgeschlossen ({signedTotal})</option>
            <option value="NONE">⚪ Mitarbeiter ohne Vertrag</option>
          </select>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => openGeneratorForEmployee(contractFilterEmpId !== 'ALL' ? contractFilterEmpId : selectedEmpId)}
            style={{ fontWeight: 800, padding: '7px 13px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} /> Vertrag generieren
          </button>
        </div>
      </div>

      {/* =====================================================================
          SECTION A: ALL CONTRACTS FLAT LIST VIEW WITH STATUS
         ===================================================================== */}
      {(contractsViewMode === 'BOTH' || contractsViewMode === 'FLAT_LIST') && (
        <div className="glass-panel" style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <div>
              <strong style={{ fontSize: 14.5, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} style={{ color: '#FF6B00' }} />
                Alle Verträge — Gesamtliste mit Status ({filteredContractsList.length})
              </strong>
              <div style={{ fontSize: 11.5, color: '#64748b' }}>
                Direkte Listenansicht sämtlicher ausgestellter Verträge inklusive aktuellem Unterschriftsstatus und Portal-Freigabe.
              </div>
            </div>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => openGeneratorForEmployee(selectedEmpId || employees[0]?.id)}
              style={{ fontWeight: 800 }}
            >
              <Plus size={13} /> Neuer Vertrag (Vertrag generieren)
            </button>
          </div>

          {loadingContracts ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Lade Verträge...</div>
          ) : filteredContractsList.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: 10, color: '#64748b', fontSize: 12.5 }}>
              Keine Verträge für die aktuelle Filterung vorhanden. Klicken Sie oben rechts auf <strong>„+ Vertrag generieren“</strong>, um neue Verträge auszustellen.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#fff', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Mitarbeiter</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Vertragsmodul / Bezeichnung</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Ausgestellt / Signiert</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Status &amp; Portal-Sichtbarkeit</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Aktionen &amp; Unterschrift-Upload</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContractsList.map((c) => {
                    const isSigned = c.status === 'Signed';
                    const isUploadingThis = uploadingSignedId === c.id;
                    const fileUrl = c.url || c.download_url;
                    const empObj = employees.find((e) => String(e.id) === String(c.employee_id));
                    return (
                      <tr key={`flat-${c.id}`} style={{ borderBottom: '1px solid #e2e8f0', background: isSigned ? '#f0fdf4' : '#ffffff' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ padding: '2px 6px', borderRadius: 5, background: '#0f172a', color: '#fff', fontFamily: 'monospace', fontSize: 10.5, fontWeight: 700 }}>
                              {empObj?.employee_number || c.employee_number || 'EMP'}
                            </span>
                            <strong style={{ color: '#0f172a' }}>{empObj?.full_name || c.employee_name || 'Mitarbeiter'}</strong>
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            {empObj?.role || c.employee_role || '—'} · {empObj?.employment_type || c.employment_type || '—'}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <FileText size={14} style={{ color: isSigned ? '#059669' : '#FF6B00' }} />
                            {c.title}
                            {c.is_mandatory_dsgvo && (
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#d1fae5', color: '#065f46', fontWeight: 800 }}>
                                PFLICHT-DSGVO
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            Typ: {c.contract_type} {c.signed_file_name ? `· Signiert: ${c.signed_file_name}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#334155' }}>
                          <div>Ausgestellt: {formatDate(c.issued_at || c.created_at)}</div>
                          {isSigned && c.signed_at && (
                            <div style={{ fontSize: 10.5, color: '#059669', fontWeight: 700 }}>
                              Signiert: {formatDate(c.signed_at)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {isSigned ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                              <span style={{ padding: '3px 9px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontWeight: 800, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Check size={12} /> Abgeschlossen / Unterschrieben
                              </span>
                              <span style={{ fontSize: 10.5, color: '#047857', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Unlock size={11} /> Sichtbar für Mitarbeiter
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                              <span style={{ padding: '3px 9px', borderRadius: 999, background: '#fef3c7', color: '#b45309', fontWeight: 800, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Clock size={12} /> Ausstehend (Pending)
                              </span>
                              <span style={{ fontSize: 10.5, color: '#dc2626', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Lock size={11} /> Gesperrt im Mitarbeiter-Portal
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {c.html_content && (
                              <>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  style={{ padding: '5px 9px', fontSize: 11.5 }}
                                  onClick={() => setEditingIssuedContract({ ...c })}
                                >
                                  <Edit3 size={12} /> Vorschau / Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  style={{ padding: '5px 9px', fontSize: 11.5 }}
                                  onClick={() => downloadSingleContractPdf(c.title, c.html_content)}
                                >
                                  <Download size={12} /> Als PDF
                                </button>
                              </>
                            )}
                            {isSigned && fileUrl && (
                              <a
                                href={resolveMediaUrl(fileUrl)}
                                target="_blank"
                                rel="noreferrer"
                                download={c.file_name || true}
                                className="btn-secondary btn-sm"
                                style={{ textDecoration: 'none', color: '#047857', borderColor: '#6ee7b7', background: '#ecfdf5', fontWeight: 700, padding: '5px 9px', fontSize: 11.5 }}
                              >
                                <Download size={12} /> Signiertes PDF
                              </a>
                            )}
                            <label
                              className="btn-primary btn-sm"
                              style={{
                                cursor: isUploadingThis ? 'not-allowed' : 'pointer',
                                background: isSigned ? '#059669' : '#FF6B00',
                                padding: '5px 10px',
                                fontSize: 11.5,
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                margin: 0,
                              }}
                            >
                              <Upload size={12} />
                              {isUploadingThis ? 'Lädt hoch...' : isSigned ? 'PDF ersetzen' : 'Unterschrieben hochladen'}
                              <input
                                type="file"
                                accept=".pdf,image/*"
                                style={{ display: 'none' }}
                                disabled={isUploadingThis}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadSignedContract(c, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{ color: '#dc2626', padding: '5px 8px' }}
                              onClick={() => handleDeleteContract(c)}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SECTION B: CONTRACTS OVERVIEW SEPARATED FOR EACH MITARBEITER
         ===================================================================== */}
      {(contractsViewMode === 'BOTH' || contractsViewMode === 'BY_EMPLOYEE') && (
        <div className="glass-panel" style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div>
                <strong style={{ fontSize: 14.5, color: '#0f172a' }}>
                  Verträge getrennt nach Mitarbeiter &amp; Upload unterschriebener Verträge ({groupedByEmployee.length} Mitarbeiter)
                </strong>
                <div style={{ fontSize: 11.5, color: '#64748b' }}>
                  Für jeden Mitarbeiter sehen Sie hier alle zugehörigen Verträge mit Status. Über <strong>„+ Vertrag generieren“</strong> öffnen Sie das Vertragsgenerator-Fenster direkt für diesen Mitarbeiter.
                </div>
              </div>
            </div>
          </div>

          {loadingContracts ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Lade Verträge...</div>
          ) : groupedByEmployee.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: 10, color: '#64748b', fontSize: 13 }}>
              Noch keine Einträge für die gewählten Filter vorhanden. Klicken Sie auf <strong>„+ Vertrag generieren“</strong>, um Verträge auszustellen.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {groupedByEmployee.map((grp) => {
                const pendCount = grp.contracts.filter((c) => c.status === 'Pending_Signature').length;
                const signCount = grp.contracts.filter((c) => c.status === 'Signed').length;
                const attr = grp.attributes || {};
                const salutationPrefix = attr.salutation || attr.anrede || '';
                return (
                  <div key={grp.employee_id} style={{ border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                    {/* Employee Group Header */}
                    <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, background: '#0f172a', color: '#fff', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
                          {grp.employee_number}
                        </span>
                        <strong style={{ fontSize: 14, color: '#0f172a' }}>
                          {salutationPrefix ? `${salutationPrefix} ` : ''}{grp.employee_name}
                        </strong>
                        <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                          {grp.role} · {grp.employment_type}
                        </span>
                        {grp.base_salary > 0 && (
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '2px 8px', borderRadius: 6 }}>
                            Brutto: {formatEuro(grp.base_salary)}/Mo
                          </span>
                        )}
                        {attr.contract_start_date && (
                          <span style={{ fontSize: 11.5, color: '#334155', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>
                            Start: <strong>{formatDate(attr.contract_start_date)}</strong>
                          </span>
                        )}
                        {attr.probezeit_end_date && (
                          <span style={{ fontSize: 11.5, color: '#9a3412', background: '#fff7ed', padding: '2px 8px', borderRadius: 6 }}>
                            Probezeit bis: <strong>{formatDate(attr.probezeit_end_date)}</strong>
                          </span>
                        )}
                        {attr.praktikum_start_date && (
                          <span style={{ fontSize: 11.5, color: '#5b21b6', background: '#f5f3ff', padding: '2px 8px', borderRadius: 6 }}>
                            Praktikum: <strong>{formatDate(attr.praktikum_start_date)} – {formatDate(attr.praktikum_end_date)}</strong>
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {grp.contracts.length === 0 && (
                          <span style={{ padding: '3px 9px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontSize: 11, fontWeight: 700 }}>
                            ⚪ Noch kein Vertrag ausgestellt
                          </span>
                        )}
                        {pendCount > 0 && (
                          <span style={{ padding: '3px 9px', borderRadius: 999, background: '#fef3c7', color: '#b45309', fontSize: 11, fontWeight: 800 }}>
                            ⏳ {pendCount} Ausstehend (Pending)
                          </span>
                        )}
                        {signCount > 0 && (
                          <span style={{ padding: '3px 9px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 800 }}>
                            ✅ {signCount} Unterschrieben (Completed)
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          style={{ fontSize: 11.5, padding: '5px 11px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                          onClick={() => openGeneratorForEmployee(grp.employee_id)}
                        >
                          <Plus size={12} /> Vertrag generieren
                        </button>
                        {grp.contracts.length > 0 && pendCount > 0 && (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled
                            style={{
                              fontSize: 11,
                              padding: '4px 9px',
                              color: '#94a3b8',
                              borderColor: '#cbd5e1',
                              background: '#f8fafc',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'not-allowed',
                            }}
                            title="Die Willkommens-E-Mail wird erst freigeschaltet, wenn alle Verträge dieses Mitarbeiters unterschrieben und hochgeladen sind."
                          >
                            <Lock size={11} />
                            Willkommens-E-Mail (Noch {pendCount} Vertrag{pendCount > 1 ? 'e' : ''} offen)
                          </button>
                        )}
                        {grp.contracts.length > 0 && pendCount === 0 && signCount > 0 && (
                          <>
                            {attr.onboarding_email_sent && (
                              <span
                                style={{
                                  padding: '3px 9px',
                                  borderRadius: 999,
                                  background: '#d1fae5',
                                  color: '#065f46',
                                  fontSize: 11,
                                  fontWeight: 800,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Check size={12} /> E-Mail gesendet
                              </span>
                            )}
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              style={{
                                fontSize: 11.5,
                                padding: '5px 11px',
                                color: '#ffffff',
                                borderColor: '#047857',
                                background: '#059669',
                                fontWeight: 800,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                              }}
                              onClick={() => {
                                if (
                                  attr.onboarding_email_sent &&
                                  !window.confirm(
                                    `Die Willkommens-E-Mail wurde bereits an ${attr.private_email || grp.employee_name} gesendet. Möchten Sie sie noch einmal senden?`
                                  )
                                ) {
                                  return;
                                }
                                handleTriggerOnboardingEmail(
                                  grp.employee_id,
                                  false,
                                  `${signCount} Verträge unterschrieben`,
                                  undefined,
                                  true
                                );
                              }}
                              disabled={sendingOnboardingEmpId === grp.employee_id}
                              title="Alle Verträge sind unterschrieben — Willkommens-E-Mail jetzt einmalig an die private E-Mail des Mitarbeiters senden"
                            >
                              <Send size={12} />
                              {sendingOnboardingEmpId === grp.employee_id
                                ? 'Wird gesendet...'
                                : attr.onboarding_email_sent
                                ? 'Willkommens-E-Mail erneut senden'
                                : 'Willkommens-E-Mail jetzt senden'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{ fontSize: 11, padding: '4px 8px', color: '#047857', borderColor: '#6ee7b7', background: '#ecfdf5', fontWeight: 700 }}
                              onClick={() => handleTriggerOnboardingEmail(grp.employee_id, false, `${signCount} Verträge unterschrieben`, undefined, false)}
                              disabled={sendingOnboardingEmpId === grp.employee_id}
                              title="Vorschau der Willkommens-E-Mail und Zugangsdaten öffnen"
                            >
                              <Mail size={12} /> Vorschau
                            </button>
                          </>
                        )}
                        {grp.empObj && effectiveOpenEmpModal && (
                          <button type="button" className="btn-secondary btn-sm" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => effectiveOpenEmpModal(grp.empObj)}>
                            Personalakte öffnen
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Employee's Contracts Table */}
                    {grp.contracts.length === 0 ? (
                      <div style={{ padding: '12px 16px', fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfcfd' }}>
                        <span>Für {grp.employee_name} wurden noch keine Verträge generiert.</span>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          style={{ fontSize: 11.5, fontWeight: 700, borderColor: '#FF6B00', color: '#c2410c' }}
                          onClick={() => openGeneratorForEmployee(grp.employee_id)}
                        >
                          Jetzt Verträge für {grp.employee_name} erstellen →
                        </button>
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', color: '#475569', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Vertragsmodul / Bezeichnung</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Ausgestellt am</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Status &amp; Mitarbeiter-Sichtbarkeit</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Aktionen &amp; Unterschrift-Upload</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grp.contracts.map((c) => {
                            const isSigned = c.status === 'Signed';
                            const isUploadingThis = uploadingSignedId === c.id;
                            const fileUrl = c.url || c.download_url;
                            return (
                              <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: isSigned ? '#f0fdf4' : '#ffffff' }}>
                                <td style={{ padding: '10px 12px' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <FileText size={14} style={{ color: isSigned ? '#059669' : '#FF6B00' }} />
                                    {c.title}
                                    {c.is_mandatory_dsgvo && (
                                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#d1fae5', color: '#065f46', fontWeight: 800 }}>
                                        PFLICHT-DSGVO
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                    Typ: {c.contract_type} {c.signed_file_name ? `· Datei: ${c.signed_file_name}` : ''}
                                  </div>
                                </td>
                                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#334155' }}>
                                  <div>{formatDate(c.issued_at || c.created_at)}</div>
                                  {isSigned && c.signed_at && (
                                    <div style={{ fontSize: 10.5, color: '#059669', fontWeight: 700 }}>
                                      Unterschrieben: {formatDate(c.signed_at)}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                  {isSigned ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                                      <span style={{ padding: '3px 9px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontWeight: 800, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Check size={12} /> Abgeschlossen / Unterschrieben
                                      </span>
                                      <span style={{ fontSize: 10.5, color: '#047857', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Unlock size={11} /> Sichtbar für Mitarbeiter unter „Dokumente“
                                      </span>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                                      <span style={{ padding: '3px 9px', borderRadius: 999, background: '#fef3c7', color: '#b45309', fontWeight: 800, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Clock size={12} /> Ausstehend (Pending Signature)
                                      </span>
                                      <span style={{ fontSize: 10.5, color: '#dc2626', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Lock size={11} /> Nicht sichtbar für Mitarbeiter im Portal
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                                    {c.html_content && (
                                      <>
                                        <button
                                          type="button"
                                          className="btn-secondary btn-sm"
                                          style={{ padding: '5px 9px', fontSize: 11.5 }}
                                          onClick={() => setEditingIssuedContract({ ...c })}
                                          title="Vertragstext ansehen oder bearbeiten"
                                        >
                                          <Edit3 size={12} /> Vorschau / Edit
                                        </button>
                                        <button
                                          type="button"
                                          className="btn-secondary btn-sm"
                                          style={{ padding: '5px 9px', fontSize: 11.5 }}
                                          onClick={() => downloadSingleContractPdf(c.title, c.html_content)}
                                          title="Als separate A4 PDF-Datei herunterladen"
                                        >
                                          <Download size={12} /> Als PDF
                                        </button>
                                      </>
                                    )}
                                    {isSigned && fileUrl && (
                                      <a
                                        href={resolveMediaUrl(fileUrl)}
                                        target="_blank"
                                        rel="noreferrer"
                                        download={c.file_name || true}
                                        className="btn-secondary btn-sm"
                                        style={{ textDecoration: 'none', color: '#047857', borderColor: '#6ee7b7', background: '#ecfdf5', fontWeight: 700, padding: '5px 9px', fontSize: 11.5 }}
                                      >
                                        <Download size={12} /> Signiertes PDF
                                      </a>
                                    )}

                                    {/* Upload Signed Contract PDF Button */}
                                    <label
                                      className="btn-primary btn-sm"
                                      style={{
                                        cursor: isUploadingThis ? 'not-allowed' : 'pointer',
                                        background: isSigned ? '#059669' : '#FF6B00',
                                        padding: '5px 10px',
                                        fontSize: 11.5,
                                        fontWeight: 700,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        margin: 0,
                                      }}
                                      title="Unterschriebenen Vertrag (PDF/Scan) hochladen → Markiert Vertrag als Abgeschlossen und schaltet ihn für den Mitarbeiter frei"
                                    >
                                      <Upload size={12} />
                                      {isUploadingThis
                                        ? 'Lädt hoch...'
                                        : isSigned
                                        ? 'Signiertes PDF ersetzen'
                                        : 'Unterschriebenen Vertrag hochladen'}
                                      <input
                                        type="file"
                                        accept=".pdf,image/*"
                                        style={{ display: 'none' }}
                                        disabled={isUploadingThis}
                                        onChange={(e) => {
                                          const f = e.target.files?.[0];
                                          if (f) handleUploadSignedContract(c, f);
                                          e.target.value = '';
                                        }}
                                      />
                                    </label>

                                    <button
                                      type="button"
                                      className="btn-secondary btn-sm"
                                      style={{ color: '#dc2626', padding: '5px 8px' }}
                                      onClick={() => handleDeleteContract(c)}
                                      title="Vertrag löschen"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          INTERNAL MODAL WINDOW: GENERATE CONTRACT WIZARD (STEPS 1 TO 4)
         ===================================================================== */}
      {showGeneratorModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.72)',
            backdropFilter: 'blur(4px)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowGeneratorModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '96vw',
              maxWidth: 1320,
              maxHeight: '94vh',
              background: '#f8fafc',
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(15,23,42,0.45)',
              border: '1px solid #334155',
            }}
          >
            {/* Modal Sticky Header */}
            <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: '3px solid #FF6B00' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ padding: '3px 9px', borderRadius: 6, background: '#FF6B00', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                    VERTRAGS-GENERATOR
                  </span>
                  <strong style={{ fontSize: 15.5 }}>
                    Neuen Vertrag / Vertragspaket generieren {selectedEmp ? `— ${selectedEmp.full_name}` : ''}
                  </strong>
                </div>
                <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 2 }}>
                  Mitarbeiter &amp; Vertragsmodule auswählen → Konditionen prüfen → Vertragstext live im Dokument anpassen → Verbindlich ausstellen &amp; als PDF speichern
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={issuing}
                  onClick={handleIssueSelectedContracts}
                  style={{ fontWeight: 800, padding: '8px 14px' }}
                >
                  <Check size={14} />{' '}
                  {issuing ? 'Wird ausgestellt...' : `Verträge ausstellen (${selectedCodes.length})`}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setShowGeneratorModal(false)}
                  style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}
                >
                  <X size={14} /> Fenster schließen
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {issueSuccessBanner && (
                <div style={{ padding: '14px 18px', borderRadius: 12, background: '#ecfdf5', border: '1.5px solid #10b981', color: '#065f46', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={18} style={{ color: '#059669' }} />
                      {issueSuccessBanner.count} Verträge für {issueSuccessBanner.employeeName} erfolgreich ausgestellt!
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4, color: '#047857' }}>
                      Die Verträge wurden in der Liste hinterlegt (Status: <strong>Ausstehend</strong>). Sie können die PDFs jetzt drucken/speichern oder dieses Fenster schließen.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(issueSuccessBanner.contracts || []).map((c, idx) => (
                      <button
                        key={c.id || idx}
                        type="button"
                        className="btn-secondary btn-sm"
                        style={{ borderColor: '#059669', color: '#065f46', background: '#ffffff', fontWeight: 700, fontSize: 11.5 }}
                        onClick={() => downloadSingleContractPdf(c.title, c.html_content)}
                      >
                        <Download size={12} /> PDF {idx + 1}: {c.contract_code || 'Vertrag'}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() =>
                        downloadContractsAsSeparatePdfs(
                          issueSuccessBanner.contracts,
                          issueSuccessBanner.employeeName
                        )
                      }
                    >
                      <Download size={14} /> Alle {issueSuccessBanner.count} Verträge als separate PDF-Dateien speichern
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setShowGeneratorModal(false)}>
                      Fertig &amp; Zurück zur Liste
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 1 & STEP 2: SELECT MITARBEITER & MULTI-SELECT CONTRACT MODULES */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 14 }}>
                {/* STEP 1: Select Mitarbeiter */}
                <div className="glass-panel" style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 24, height: 24, borderRadius: 999, background: '#FF6B00', color: '#fff', fontWeight: 800, fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
                      <strong style={{ fontSize: 14, color: '#0f172a' }}>Mitarbeiter auswählen</strong>
                    </div>
                    {onOpenCreateEmployeeModal && (
                      <button type="button" className="btn-secondary btn-sm" onClick={onOpenCreateEmployeeModal} style={{ fontSize: 11.5, fontWeight: 700 }}>
                        <Plus size={12} /> Neuer Mitarbeiter (KI-Scan)
                      </button>
                    )}
                  </div>

                  <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Registrierter Mitarbeiter aus Datenbank *</label>
                  <select
                    value={selectedEmpId}
                    onChange={(e) => setSelectedEmpId(e.target.value)}
                    style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, borderColor: '#FF6B00', background: '#fffbf7' }}
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name} ({e.employee_number || 'EMP'} · {e.role} · {e.employment_type})
                      </option>
                    ))}
                  </select>

                  {selectedEmp && (
                    <div style={{ padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{conditions.salutation || 'Herr'} {selectedEmp.full_name}</strong>
                        <span style={{ padding: '2px 8px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 11 }}>
                          {selectedEmp.employee_number}
                        </span>
                      </div>
                      <div style={{ color: '#475569' }}>
                        <strong>Portal-Login (@bruenel.de):</strong> <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{selectedEmp.email || '—'}</span>
                      </div>
                      <div style={{ color: '#047857' }}>
                        <strong>Private E-Mail (Onboarding):</strong> <strong>{selectedEmp.attributes?.private_email || '— (Bitte eintragen)'}</strong>
                      </div>
                      <div style={{ color: '#475569' }}>
                        <strong>Adresse:</strong> {conditions.street || '—'}, {conditions.postal_code || '—'} {conditions.city || '—'}
                      </div>
                      <div style={{ color: '#475569' }}>
                        <strong>Position / Typ:</strong> {selectedEmp.role} · {selectedEmp.employment_type}
                      </div>
                      <div style={{ color: '#475569' }}>
                        <strong>Steuer-ID / SV-Nr.:</strong> {selectedEmp.attributes?.steuer_id || '—'} · {selectedEmp.attributes?.sozialversicherungsnummer || '—'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        {effectiveOpenEmpModal && (
                          <button type="button" className="btn-secondary btn-sm" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => effectiveOpenEmpModal(selectedEmp)}>
                            <Edit3 size={11} /> Personalakte / Stammdaten bearbeiten
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* STEP 2: Multi-Select Contract Modules */}
                <div className="glass-panel" style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 24, height: 24, borderRadius: 999, background: '#FF6B00', color: '#fff', fontWeight: 800, fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>2</span>
                      <strong style={{ fontSize: 14, color: '#0f172a' }}>Vertragsmodule auswählen (Mehrfachauswahl möglich)</strong>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '3px 9px', borderRadius: 999, border: '1px solid #6ee7b7' }}>
                      {selectedCodes.length} von 5 Modulen aktiv
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                    {CONTRACT_CATALOG.map((mod) => {
                      const IconComp = mod.icon;
                      const isSelected = selectedCodes.includes(mod.code) || mod.mandatory;
                      return (
                        <div
                          key={mod.code}
                          onClick={() => toggleContractCode(mod.code)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: isSelected ? `2px solid ${mod.mandatory ? '#059669' : '#FF6B00'}` : '1px solid #e2e8f0',
                            background: isSelected ? (mod.mandatory ? '#ecfdf5' : '#fff7ed') : '#ffffff',
                            cursor: mod.mandatory ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            transition: 'all 0.15s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={mod.mandatory}
                            onChange={() => {}}
                            style={{ width: 16, height: 16, marginTop: 2, accentColor: mod.mandatory ? '#059669' : '#FF6B00' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                              <strong style={{ fontSize: 12.5, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <IconComp size={14} style={{ color: mod.color, flexShrink: 0 }} />
                                {mod.shortLabel}
                              </strong>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#e2e8f0', color: '#334155' }}>
                                {mod.pages} S.
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.35 }}>
                              {mod.subtitle}
                            </div>
                            {mod.mandatory && (
                              <div style={{ marginTop: 4, fontSize: 10, fontWeight: 800, color: '#047857' }}>
                                🔒 PFLICHTVERTRAG — Wird automatisch jedem Vertragspaket beigefügt
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* STEP 3: DYNAMIC CONDITIONS & PARAMETERS FORM */}
              <div className="glass-panel" style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 999, background: '#FF6B00', color: '#fff', fontWeight: 800, fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>3</span>
                    <strong style={{ fontSize: 14, color: '#0f172a' }}>
                      Vertragskonditionen &amp; Mitarbeiterdaten (Synchronisiert mit Personalakte &amp; Vertragsvorlagen)
                    </strong>
                  </div>
                  <span style={{ fontSize: 11.5, color: '#64748b' }}>
                    Alle Eingaben werden sofort live in die ausgewählten Vertragsvorlagen übernommen.
                  </span>
                </div>

                {/* Common Personal & Address Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700 }}>Anrede (Herr / Frau / Firma) *</label>
                    <select
                      value={conditions.salutation || 'Herr'}
                      onChange={(e) => updateCond('salutation', e.target.value)}
                      style={{ fontWeight: 700 }}
                    >
                      <option value="Herr">Herr</option>
                      <option value="Frau">Frau</option>
                      <option value="Firma">Firma</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700 }}>Vorname *</label>
                    <input value={conditions.first_name} onChange={(e) => updateCond('first_name', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700 }}>Nachname *</label>
                    <input value={conditions.last_name} onChange={(e) => updateCond('last_name', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700 }}>Straße &amp; Hausnr. *</label>
                    <input value={conditions.street} onChange={(e) => updateCond('street', e.target.value)} placeholder="z.B. Hauptstr. 12" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700 }}>PLZ *</label>
                    <input value={conditions.postal_code} onChange={(e) => updateCond('postal_code', e.target.value)} placeholder="61184" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700 }}>Wohnort / Stadt *</label>
                    <input value={conditions.city} onChange={(e) => updateCond('city', e.target.value)} placeholder="Karben" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#047857' }}>Private E-Mail (Onboarding)</label>
                    <input
                      type="email"
                      value={conditions.private_email || ''}
                      onChange={(e) => updateCond('private_email', e.target.value)}
                      placeholder="name@gmail.com"
                      style={{ borderColor: '#6ee7b7', background: '#f0fdf4' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700 }}>Vertragsdatum (Karben, den)</label>
                    <DateInput value={conditions.signed_date} onChange={(e) => updateCond('signed_date', e.target.value)} />
                  </div>
                </div>

                {/* Arbeitsvertrag Conditions */}
                {selectedCodes.includes('ARBEITSVERTRAG') && (
                  <div style={{ padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #cbd5e1', marginBottom: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 12.5, color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Briefcase size={14} /> Konditionen für 1. Arbeitsvertrag &amp; Anlage 1 (Vertraulichkeitsvereinbarung)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Job-Titel / Position (§ 3) *</label>
                        <input value={conditions.role} onChange={(e) => updateCond('role', e.target.value)} placeholder="z.B. Projektleiter" />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Vertragsbeginn am (§ 1) *</label>
                        <DateInput value={conditions.contract_start_date} onChange={(e) => updateCond('contract_start_date', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Probezeit (Monate, § 2)</label>
                        <input type="number" min="0" max="6" value={conditions.probezeit_months} onChange={(e) => updateCond('probezeit_months', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#c2410c' }}>Probezeit Ende am (§ 2)</label>
                        <DateInput value={conditions.probezeit_end_date} onChange={(e) => updateCond('probezeit_end_date', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Wochenstunden (§ 4)</label>
                        <input type="number" step="0.5" value={conditions.weekly_hours} onChange={(e) => updateCond('weekly_hours', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#047857' }}>Monatsgehalt Brutto EUR (§ 5) *</label>
                        <input type="number" step="50" value={conditions.base_salary} onChange={(e) => updateCond('base_salary', e.target.value)} style={{ fontWeight: 800, borderColor: '#10b981', background: '#ecfdf5' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Mindesturlaub + Zusatz (§ 6)</label>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input type="number" value={conditions.statutory_leave_days} onChange={(e) => updateCond('statutory_leave_days', e.target.value)} title="Gesetzlicher Mindesturlaub (20)" />
                          <span>+</span>
                          <input type="number" value={conditions.extra_leave_days} onChange={(e) => updateCond('extra_leave_days', e.target.value)} title="Vertraglicher Zusatzurlaub (4)" />
                          <span style={{ fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>= {conditions.annual_leave_days} T.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Orientierungspraktikum Conditions */}
                {selectedCodes.includes('PRAKTIKUM') && (
                  <div style={{ padding: 12, borderRadius: 10, background: '#f5f3ff', border: '1px solid #ddd6fe', marginBottom: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 12.5, color: '#5b21b6', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <GraduationCap size={14} /> Konditionen für 3. Unbezahltes Orientierungspraktikum (Einfühlungsverhältnis gem. § 22 Abs. 1 Nr. 2 MiLoG)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Praktikum Beginn (vom) *</label>
                        <DateInput value={conditions.praktikum_start_date} onChange={(e) => updateCond('praktikum_start_date', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Praktikum Ende (bis zum) *</label>
                        <DateInput value={conditions.praktikum_end_date} onChange={(e) => updateCond('praktikum_end_date', e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'end', fontSize: 11.5, color: '#5b21b6', fontWeight: 600 }}>
                        ✓ Unentgeltliches Einfühlungsverhältnis (§ 22 Abs. 1 Nr. 2 MiLoG) — wird im Mitarbeiterprofil gespeichert.
                      </div>
                    </div>
                  </div>
                )}

                {/* Kfz-Übergabeprotokoll Conditions */}
                {selectedCodes.includes('KFZ_UEBERGABE') && (
                  <div style={{ padding: 12, borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 12.5, color: '#1e40af', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Car size={14} /> Konditionen für 2. Kfz-Übergabeprotokoll und Nutzungsvereinbarung
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Fahrzeug aus Fuhrpark wählen</label>
                        <select value={conditions.vehicle_id} onChange={(e) => handleSelectFleetVehicle(e.target.value)}>
                          <option value="">— Manuelle Eingabe / Fahrzeug wählen —</option>
                          {vehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.plate_number} · {v.model} ({v.mileage_km || 0} km)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Fahrzeugmarke / Modell (§ 1)</label>
                        <input value={conditions.vehicle_model} onChange={(e) => updateCond('vehicle_model', e.target.value)} placeholder="z.B. Ford Transit / VW Crafter" />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Amtliches Kennzeichen (§ 1)</label>
                        <input value={conditions.vehicle_plate} onChange={(e) => updateCond('vehicle_plate', e.target.value)} placeholder="z.B. FB-BR 104" />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Fahrgestellnummer (FIN)</label>
                        <input value={conditions.vehicle_vin} onChange={(e) => updateCond('vehicle_vin', e.target.value)} placeholder="WF0XXX..." />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Kilometerstand (km)</label>
                        <input type="number" value={conditions.vehicle_mileage} onChange={(e) => updateCond('vehicle_mileage', e.target.value)} placeholder="42500" />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Nächste HU / TÜV</label>
                        <DateInput value={conditions.vehicle_tuv} onChange={(e) => updateCond('vehicle_tuv', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Zustand bei Übergabe (§ 2)</label>
                        <select value={conditions.vehicle_condition} onChange={(e) => updateCond('vehicle_condition', e.target.value)}>
                          <option value="ok">Einwandfrei &amp; unbeschädigt</option>
                          <option value="defects">Vorhandene Mängel / Kratzer</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Tankkarte / Schlüssel / Zubehör (§ 3)</label>
                        <input value={conditions.vehicle_fuel_card} onChange={(e) => updateCond('vehicle_fuel_card', e.target.value)} placeholder="DKV / 2 Schlüssel" />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Vorhandene Mängel / Schäden (§ 2) &amp; Sonstiges Zubehör (§ 3)</label>
                        <input value={conditions.vehicle_defects} onChange={(e) => updateCond('vehicle_defects', e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Subunternehmervertrag Conditions */}
                {selectedCodes.includes('SUBUNTERNEHMER') && (
                  <div style={{ padding: 12, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                    <div style={{ fontWeight: 800, fontSize: 12.5, color: '#9a3412', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ShieldCheck size={14} /> Konditionen für 4. Subunternehmervertrag (Werkvertrag NE4) + Ausführungs- &amp; Sicherheitsrichtlinien
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Firmenname / Auftragnehmer</label>
                        <input value={conditions.company_name} onChange={(e) => updateCond('company_name', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Projektstandort (§ 1 Abs. 2)</label>
                        <input value={conditions.sub_location} onChange={(e) => updateCond('sub_location', e.target.value)} placeholder="77704 Oberkirch" />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Umkreis (km)</label>
                        <input type="number" value={conditions.sub_radius_km} onChange={(e) => updateCond('sub_radius_km', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Variante A Vollausbau (€/WE)</label>
                        <input type="number" step="1" value={conditions.sub_rate_variante_a} onChange={(e) => updateCond('sub_rate_variante_a', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Variante B Teilausbau (€/WE)</label>
                        <input type="number" step="1" value={conditions.sub_rate_variante_b} onChange={(e) => updateCond('sub_rate_variante_b', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700 }}>Zahlungsziel (Tage, § 3)</label>
                        <input type="number" value={conditions.sub_payment_term_days} onChange={(e) => updateCond('sub_payment_term_days', e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* STEP 4: LIVE EDITABLE CONTRACT TEMPLATE PREVIEW & ISSUE / PDF ACTIONS */}
              <div className="glass-panel" style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 999, background: '#FF6B00', color: '#fff', fontWeight: 800, fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>4</span>
                    <div>
                      <strong style={{ fontSize: 14, color: '#0f172a' }}>
                        Live-Vertragsvorschau &amp; Freier Text-Editor (Direkt im Dokument editierbar)
                      </strong>
                      <div style={{ fontSize: 11.5, color: '#64748b' }}>
                        Klicken Sie direkt in das Vertragsdokument unten, um beliebige Paragraphen, Klauseln oder Formulierungen vor dem Ausstellen individuell anzupassen.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => handleResetTemplateText(activePreviewCode)}
                      title="Aktuelle Vorlage auf Standardtext mit aktuellen Konditionen zurücksetzen"
                    >
                      <RefreshCw size={13} /> Vorlage zurücksetzen
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        const currentHtml = editorRef.current ? editorRef.current.innerHTML : draftHtmlMap[activePreviewCode];
                        const mod = CONTRACT_CATALOG.find((c) => c.code === activePreviewCode);
                        downloadSingleContractPdf(
                          `${mod?.title || 'Vertrag'} — ${conditions.first_name} ${conditions.last_name}`,
                          currentHtml
                        );
                      }}
                    >
                      <Download size={14} /> Aktuellen Vertrag als PDF speichern
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      style={{ borderColor: '#0f172a', color: '#0f172a', fontWeight: 700 }}
                      onClick={() => {
                        const currentMap = { ...draftHtmlMap };
                        if (editorRef.current && activePreviewCode) {
                          currentMap[activePreviewCode] = editorRef.current.innerHTML;
                        }
                        const ordered = CONTRACT_CATALOG.filter((c) => selectedCodes.includes(c.code) || c.mandatory);
                        const empFullName = `${conditions.first_name || ''} ${conditions.last_name || ''}`.trim();
                        downloadContractsAsSeparatePdfs(
                          ordered.map((c) => ({
                            contract_code: c.code,
                            title: `${c.title}_${empFullName}`,
                            html_content: currentMap[c.code] || generateContractHtml(c.code, selectedEmp, conditions),
                          })),
                          empFullName
                        );
                      }}
                    >
                      <Download size={14} /> Alle {selectedCodes.length} Verträge als separate PDF-Dateien speichern
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={issuing}
                      onClick={handleIssueSelectedContracts}
                      style={{ fontWeight: 800, padding: '8px 16px' }}
                    >
                      <Check size={15} />{' '}
                      {issuing
                        ? 'Verträge werden ausgestellt...'
                        : `Verträge verbindlich ausstellen (${selectedCodes.length}) & Akte aktualisieren`}
                    </button>
                  </div>
                </div>

                {/* Contract Switcher Tabs for Preview */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #e2e8f0' }}>
                  {CONTRACT_CATALOG.filter((c) => selectedCodes.includes(c.code) || c.mandatory).map((c) => {
                    const active = activePreviewCode === c.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => {
                          if (editorRef.current && activePreviewCode) {
                            const html = editorRef.current.innerHTML;
                            setDraftHtmlMap((prev) => ({ ...prev, [activePreviewCode]: html }));
                          }
                          setActivePreviewCode(c.code);
                        }}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: active ? '2px solid #FF6B00' : '1px solid #cbd5e1',
                          background: active ? '#fff7ed' : '#f8fafc',
                          color: active ? '#9a3412' : '#334155',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <FileText size={13} />
                        {c.shortLabel}
                        {manuallyEditedCodes[c.code] && (
                          <span style={{ fontSize: 10, background: '#fde68a', color: '#92400e', padding: '1px 5px', borderRadius: 4 }}>
                            Bearbeitet
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Editable A4 Paper Preview */}
                <div style={{ background: '#e2e8f0', padding: '20px 14px', borderRadius: 10, maxHeight: 580, overflowY: 'auto' }}>
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const updatedHtml = e.currentTarget.innerHTML;
                      setDraftHtmlMap((prev) => ({ ...prev, [activePreviewCode]: updatedHtml }));
                      setManuallyEditedCodes((prev) => ({ ...prev, [activePreviewCode]: true }));
                    }}
                    style={{
                      maxWidth: '210mm',
                      minHeight: '260mm',
                      margin: '0 auto',
                      background: '#ffffff',
                      padding: '20mm 22mm',
                      borderRadius: 4,
                      boxShadow: '0 8px 25px rgba(15,23,42,0.12)',
                      fontFamily: "'Segoe UI', Arial, sans-serif",
                      fontSize: '10.5pt',
                      lineHeight: 1.55,
                      color: '#111827',
                      outline: 'none',
                    }}
                    dangerouslySetInnerHTML={{
                      __html: draftHtmlMap[activePreviewCode] || generateContractHtml(activePreviewCode, selectedEmp, conditions),
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal for viewing / editing an already issued contract */}
      {editingIssuedContract && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div style={{ width: '100%', maxWidth: 940, maxHeight: '90vh', background: '#fff', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '12px 18px', background: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: 14 }}>{editingIssuedContract.title}</strong>
                <div style={{ fontSize: 11, color: '#cbd5e1' }}>Klicken Sie in den Vertragstext, um Änderungen vorzunehmen.</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => downloadSingleContractPdf(editingIssuedContract.title, editingIssuedContract.html_content)}
                >
                  <Download size={13} /> Als PDF speichern
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={handleSaveEditedIssuedContract}>
                  <Check size={13} /> Änderungen speichern
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingIssuedContract(null)}>
                  <X size={13} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#e2e8f0' }}>
              <div
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const html = e.currentTarget.innerHTML;
                  setEditingIssuedContract((prev) => ({ ...prev, html_content: html }));
                }}
                style={{
                  maxWidth: '210mm',
                  margin: '0 auto',
                  background: '#fff',
                  padding: '20mm',
                  borderRadius: 4,
                  fontFamily: "'Segoe UI', Arial, sans-serif",
                  fontSize: '10.5pt',
                  lineHeight: 1.55,
                }}
                dangerouslySetInnerHTML={{ __html: editingIssuedContract.html_content }}
              />
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          ONBOARDING WELCOME EMAIL & MOBILE HOMESCREEN APP MODAL
          (Automatically triggered when signed contract is uploaded!)
         ===================================================================== */}
      {onboardingEmailModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.72)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
          }}
          onClick={() => setOnboardingEmailModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 860,
              maxHeight: '92vh',
              background: '#ffffff',
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 24px 60px rgba(15,23,42,0.35)',
              border: '1px solid #cbd5e1',
            }}
          >
            {/* Modal Top Header */}
            <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: '3px solid #FF6B00' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ padding: '3px 9px', borderRadius: 999, background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                    VERTRAG ABGESCHLOSSEN &amp; ONBOARDING AKTIV
                  </span>
                  <strong style={{ fontSize: 15 }}>
                    Willkommens-E-Mail &amp; App-Zugangsdaten für {onboardingEmailModal.employee_name}
                  </strong>
                </div>
                <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 3 }}>
                  {onboardingEmailModal.smtp_note}
                </div>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setOnboardingEmailModal(null)}>
                <X size={15} /> Schließen
              </button>
            </div>

            {/* Action & Credentials Bar */}
            <div style={{ padding: '12px 20px', background: '#fff7ed', borderBottom: '1px solid #fed7aa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#047857', fontWeight: 800 }}>Private E-Mail (Empfänger):</span>
                  <input
                    type="email"
                    value={onboardingEmailModal.to_email || ''}
                    onChange={(e) => setOnboardingEmailModal((prev) => ({ ...prev, to_email: e.target.value }))}
                    placeholder="private.email@beispiel.de"
                    style={{ width: 220, padding: '4px 8px', fontSize: 12, fontWeight: 700, borderColor: '#10b981', background: '#ffffff' }}
                  />
                </div>
                <div>
                  <span style={{ color: '#9a3412', fontWeight: 700 }}>Portal-Benutzername (Kein E-Mail-Versand):</span>{' '}
                  <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>{onboardingEmailModal.username || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#9a3412', fontWeight: 700 }}>Einmal-Passwort (OTP):</span>{' '}
                  <span style={{ padding: '2px 8px', borderRadius: 6, background: '#0f172a', color: '#fff', fontFamily: 'monospace', fontWeight: 800 }}>
                    {onboardingEmailModal.otp}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {onboardingEmailModal.employee_id && (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() =>
                      handleTriggerOnboardingEmail(
                        onboardingEmailModal.employee_id,
                        false,
                        onboardingEmailModal.contract_title,
                        onboardingEmailModal.to_email,
                        true
                      )
                    }
                    disabled={sendingOnboardingEmpId === onboardingEmailModal.employee_id}
                    style={{ background: '#059669', borderColor: '#047857', color: '#ffffff', fontWeight: 800, padding: '7px 14px', fontSize: 12.5 }}
                    title="Private E-Mail speichern und Willkommens-E-Mail jetzt einmalig an diese private Adresse senden"
                  >
                    <Send size={13} /> {sendingOnboardingEmpId === onboardingEmailModal.employee_id ? 'Wird gesendet...' : 'Willkommens-E-Mail jetzt senden'}
                  </button>
                )}
                {onboardingEmailModal.employee_id && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() =>
                      handleTriggerOnboardingEmail(
                        onboardingEmailModal.employee_id,
                        true,
                        onboardingEmailModal.contract_title,
                        onboardingEmailModal.to_email,
                        true
                      )
                    }
                    disabled={sendingOnboardingEmpId === onboardingEmailModal.employee_id}
                    title="Neues Einmal-Passwort (OTP) generieren und Willkommens-E-Mail erneut senden"
                  >
                    <RefreshCw size={13} /> Neues OTP &amp; Senden
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(onboardingEmailModal.plain_text || '');
                    setCopiedOnboardingText(true);
                    setTimeout(() => setCopiedOnboardingText(false), 2500);
                  }}
                >
                  <Copy size={13} /> {copiedOnboardingText ? 'Kopiert' : 'Text kopieren'}
                </button>
                {onboardingEmailModal.to_email && !onboardingEmailModal.to_email.toLowerCase().endsWith('@bruenel.de') && (
                  <a
                    href={`mailto:${encodeURIComponent(onboardingEmailModal.to_email)}?subject=${encodeURIComponent(onboardingEmailModal.subject || '')}&body=${encodeURIComponent(onboardingEmailModal.plain_text || '')}`}
                    className="btn-secondary btn-sm"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                  >
                    <Mail size={13} /> In Mail-App öffnen
                  </a>
                )}
              </div>
            </div>

            {/* Visual Preview of the German Welcome Email */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 18, background: '#e2e8f0' }}>
              <div
                style={{ maxWidth: 660, margin: '0 auto' }}
                dangerouslySetInnerHTML={{ __html: onboardingEmailModal.html_body }}
              />
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          POP-UP NOTIFICATION AFTER ONBOARDING EMAIL IS SENT
         ===================================================================== */}
      {emailSentPopup && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 10005,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
          }}
          onClick={() => setEmailSentPopup(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#ffffff',
              borderRadius: 16,
              padding: '24px 26px',
              boxShadow: '0 24px 60px rgba(15,23,42,0.35)',
              border: '2px solid #10b981',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 999,
                background: '#dcfce7',
                color: '#059669',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <CheckCircle2 size={30} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
              Willkommens-E-Mail erfolgreich gesendet
            </h3>
            <p style={{ margin: '0 0 14px 0', fontSize: 13.5, color: '#334151', lineHeight: 1.55 }}>
              Die Onboarding-E-Mail für <strong>{emailSentPopup.employeeName}</strong> wurde erfolgreich an{' '}
              <strong style={{ color: '#047857' }}>{emailSentPopup.toEmail}</strong> versendet.
            </p>
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 12.5,
                textAlign: 'left',
                marginBottom: 18,
                color: '#334155',
                lineHeight: 1.65,
              }}
            >
              <div>
                <strong>Portal-Login:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{emailSentPopup.username}</span>
              </div>
              <div>
                <strong>Einmal-Passwort (OTP):</strong> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{emailSentPopup.otp}</span>
              </div>
              <div>
                <strong>Login-Link:</strong> <span style={{ color: '#FF6B00', fontWeight: 700 }}>{emailSentPopup.portalUrl}</span>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setEmailSentPopup(null)}
              style={{ width: '100%', padding: '10px 16px', fontWeight: 800, fontSize: 13.5, background: '#059669', borderColor: '#047857' }}
            >
              OK — Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ==============================================================================
// COMPONENT 2: EMPLOYEE OVERVIEW (EXECUTIVE HR, SALARY & PROBEZEIT RADAR)
// ==============================================================================
export const HREmployeeOverviewView = ({
  employees = [],
  onOpenEmployeeModal,
  onOpenEmployee,
  onJumpToContractGenerator,
  onGenerateContractForEmp,
}) => {
  const effectiveOpenEmpModal = onOpenEmployeeModal || onOpenEmployee;
  const effectiveJumpToContract = onJumpToContractGenerator || onGenerateContractForEmp;
  const [searchQ, setSearchQ] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterProbezeit, setFilterProbezeit] = useState('ALL');
  const [contractsList, setContractsList] = useState([]);

  useEffect(() => {
    fetchWithToken('/api/v1/hr/contracts')
      .then((res) => setContractsList(Array.isArray(res) ? res : []))
      .catch(() => setContractsList([]));
  }, [employees.length]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const enrichedEmployees = useMemo(() => {
    return employees.map((e) => {
      const attr = e.attributes || {};
      const startIso = attr.contract_start_date ? String(attr.contract_start_date).slice(0, 10) : '';
      const probeEndIso =
        attr.probezeit_end_date
          ? String(attr.probezeit_end_date).slice(0, 10)
          : startIso && !['Freelancer', 'Subunternehmer', 'Candidate'].includes(e.employment_type)
          ? addMonthsIso(startIso, attr.probezeit_months ?? 6)
          : '';

      let probeDaysLeft = null;
      let probeStatus = 'NONE'; // 'CRITICAL' | 'WARNING' | 'ACTIVE' | 'PASSED' | 'NONE'
      if (probeEndIso && !['Freelancer', 'Subunternehmer', 'Candidate'].includes(e.employment_type)) {
        const endD = new Date(`${probeEndIso}T00:00:00`);
        if (!isNaN(endD.getTime())) {
          probeDaysLeft = Math.ceil((endD.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (probeDaysLeft < 0) probeStatus = 'PASSED';
          else if (probeDaysLeft <= 14) probeStatus = 'CRITICAL';
          else if (probeDaysLeft <= 30) probeStatus = 'WARNING';
          else probeStatus = 'ACTIVE';
        }
      }

      const pkStart = attr.praktikum_start_date ? String(attr.praktikum_start_date).slice(0, 10) : '';
      const pkEnd = attr.praktikum_end_date ? String(attr.praktikum_end_date).slice(0, 10) : '';
      let pkDaysLeft = null;
      if (pkEnd) {
        const pkD = new Date(`${pkEnd}T00:00:00`);
        if (!isNaN(pkD.getTime())) {
          pkDaysLeft = Math.ceil((pkD.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      const empContracts = contractsList.filter((c) => String(c.employee_id) === String(e.id));
      const signedCount = empContracts.filter((c) => c.status === 'Signed').length;
      const pendingCount = empContracts.filter((c) => c.status === 'Pending_Signature').length;
      const hasDsgvoSigned =
        Boolean(attr.dsgvo_accepted) ||
        empContracts.some((c) => c.is_mandatory_dsgvo && c.status === 'Signed');

      return {
        ...e,
        startIso,
        probeEndIso,
        probeDaysLeft,
        probeStatus,
        pkStart,
        pkEnd,
        pkDaysLeft,
        empContracts,
        signedCount,
        pendingCount,
        hasDsgvoSigned,
        weeklyHours: Number(attr.weekly_hours ?? (e.employment_type === 'Part-time' ? 20 : 40)),
      };
    });
  }, [employees, contractsList, today]);

  // Analytics & KPI Aggregations
  const stats = useMemo(() => {
    const activeEmps = enrichedEmployees.filter((e) => e.is_active !== false);
    const fullTime = enrichedEmployees.filter((e) => e.employment_type === 'Full-time');
    const partTime = enrichedEmployees.filter((e) => e.employment_type === 'Part-time');
    const minijob = enrichedEmployees.filter((e) => e.employment_type === 'Minijob');
    const subs = enrichedEmployees.filter((e) => e.employment_type === 'Subunternehmer');
    const freelancers = enrichedEmployees.filter((e) => e.employment_type === 'Freelancer');
    const candidates = enrichedEmployees.filter((e) => e.employment_type === 'Candidate' || e.attributes?.is_candidate);
    const withPraktikum = enrichedEmployees.filter((e) => Boolean(e.pkStart));

    const salariedEmps = enrichedEmployees.filter((e) => Number(e.base_salary || 0) > 0 && e.is_active !== false);
    const totalMonthlyBrutto = salariedEmps.reduce((s, e) => s + Number(e.base_salary || 0), 0);
    const avgMonthlyBrutto = salariedEmps.length > 0 ? totalMonthlyBrutto / salariedEmps.length : 0;
    const estimatedEmployerBrutto = totalMonthlyBrutto * 1.21; // ~21% AG-Anteil Sozialversicherung

    const inProbezeit = enrichedEmployees.filter((e) => ['CRITICAL', 'WARNING', 'ACTIVE'].includes(e.probeStatus));
    const criticalProbezeit = enrichedEmployees.filter((e) => e.probeStatus === 'CRITICAL' || e.probeStatus === 'WARNING');

    return {
      total: enrichedEmployees.length,
      active: activeEmps.length,
      fullTime: fullTime.length,
      partTime: partTime.length,
      minijob: minijob.length,
      subs: subs.length,
      freelancers: freelancers.length,
      candidates: candidates.length,
      withPraktikum: withPraktikum.length,
      totalMonthlyBrutto,
      avgMonthlyBrutto,
      estimatedEmployerBrutto,
      inProbezeit,
      criticalProbezeit,
    };
  }, [enrichedEmployees]);

  const filteredList = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return enrichedEmployees.filter((e) => {
      if (filterType !== 'ALL' && e.employment_type !== filterType) return false;
      if (filterProbezeit === 'IN_PROBEZEIT' && !['CRITICAL', 'WARNING', 'ACTIVE'].includes(e.probeStatus)) return false;
      if (filterProbezeit === 'ENDING_SOON' && !['CRITICAL', 'WARNING'].includes(e.probeStatus)) return false;
      if (filterProbezeit === 'PASSED' && e.probeStatus !== 'PASSED') return false;
      if (filterProbezeit === 'PRAKTIKUM' && !e.pkStart) return false;
      if (q) {
        const hay = `${e.full_name} ${e.employee_number || ''} ${e.role || ''} ${e.department || ''} ${e.employment_type || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedEmployees, searchQ, filterType, filterProbezeit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Executive KPI & Payroll Analytics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Belegschaft Gesamt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{stats.total} Mitarbeiter</div>
          <div style={{ fontSize: 11.5, color: '#15803d', fontWeight: 700, marginTop: 4 }}>
            ✓ {stats.active} Aktiv · {stats.total - stats.active} Inaktiv
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Monatliches Bruttogehalt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#047857', marginTop: 4 }}>{formatEuro(stats.totalMonthlyBrutto)}</div>
          <div style={{ fontSize: 11.5, color: '#475569', marginTop: 4 }}>
            AG-Gesamtkosten (~121%): <strong>{formatEuro(stats.estimatedEmployerBrutto)}</strong> · Ø {formatEuro(stats.avgMonthlyBrutto)}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Vertragsarten-Mix</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            <span style={{ padding: '2px 7px', borderRadius: 6, background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700 }}>Vollzeit: {stats.fullTime}</span>
            <span style={{ padding: '2px 7px', borderRadius: 6, background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 700 }}>Teilzeit: {stats.partTime}</span>
            <span style={{ padding: '2px 7px', borderRadius: 6, background: '#f3e8ff', color: '#6d28d9', fontSize: 11, fontWeight: 700 }}>Praktikum: {stats.withPraktikum}</span>
            <span style={{ padding: '2px 7px', borderRadius: 6, background: '#ffedd5', color: '#c2410c', fontSize: 11, fontWeight: 700 }}>Sub/Werk: {stats.subs}</span>
            <span style={{ padding: '2px 7px', borderRadius: 6, background: '#fef3c7', color: '#b45309', fontSize: 11, fontWeight: 700 }}>Freelancer: {stats.freelancers}</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 16px', borderRadius: 12, background: stats.criticalProbezeit.length > 0 ? '#fff7ed' : '#fff', border: stats.criticalProbezeit.length > 0 ? '1.5px solid #f97316' : '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase' }}>Probezeit- Überwachung (§ 622 BGB)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#c2410c', marginTop: 4 }}>
            {stats.inProbezeit.length} in Probezeit
          </div>
          <div style={{ fontSize: 11.5, color: stats.criticalProbezeit.length > 0 ? '#dc2626' : '#475569', fontWeight: 700, marginTop: 4 }}>
            {stats.criticalProbezeit.length > 0
              ? `⚠️ ${stats.criticalProbezeit.length} Mitarbeiter enden in ≤ 30 Tagen!`
              : '✓ Keine kritischen Probezeit-Fristen (< 30 Tage)'}
          </div>
        </div>
      </div>

      {/* 2. Probezeit & Praktikum Legal Radar (§ 622 Abs. 3 BGB & § 1 KSchG) */}
      <div className="glass-panel" style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} style={{ color: '#FF6B00' }} />
              Probezeit- &amp; Orientierungspraktikum-Radar (Fristenkontrolle gem. § 622 Abs. 3 BGB &amp; § 1 KSchG)
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#64748b' }}>
              <strong>Arbeitsrechtlicher Hinweis:</strong> Während der 6-monatigen Probezeit gilt eine Kündigungsfrist von 2 Wochen zu jedem beliebigen Tag (§ 622 Abs. 3 BGB). Nach Ablauf von 6 Monaten greift das Kündigungsschutzgesetz (§ 1 Abs. 1 KSchG) sowie die 4-Wochen-Frist zum 15. oder Monatsende.
            </p>
          </div>
        </div>

        {stats.inProbezeit.length === 0 && stats.withPraktikum === 0 ? (
          <div style={{ padding: 18, textAlign: 'center', color: '#64748b', fontSize: 12.5, background: '#f8fafc', borderRadius: 8 }}>
            Aktuell befinden sich keine Mitarbeiter in einer laufenden Probezeit oder einem Orientierungspraktikum.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 10 }}>
            {[...stats.inProbezeit]
              .sort((a, b) => (a.probeDaysLeft ?? 999) - (b.probeDaysLeft ?? 999))
              .map((e) => {
                const isCrit = e.probeStatus === 'CRITICAL';
                const isWarn = e.probeStatus === 'WARNING';
                const pct = Math.max(5, Math.min(100, Math.round(((180 - (e.probeDaysLeft || 0)) / 180) * 100)));
                return (
                  <div
                    key={e.id}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: isCrit ? '1.5px solid #ef4444' : isWarn ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                      background: isCrit ? '#fef2f2' : isWarn ? '#fffbeb' : '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{e.full_name}</strong>
                        <div style={{ fontSize: 11, color: '#475569' }}>{e.role} · {e.department}</div>
                      </div>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 999,
                          fontSize: 10.5,
                          fontWeight: 800,
                          background: isCrit ? '#dc2626' : isWarn ? '#d97706' : '#0284c7',
                          color: '#fff',
                        }}
                      >
                        {e.probeDaysLeft === 0 ? 'Endet heute!' : `Noch ${e.probeDaysLeft} Tage`}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8, fontSize: 11.5 }}>
                      <div>
                        <span style={{ color: '#64748b' }}>Vertragsbeginn:</span>{' '}
                        <strong>{formatDate(e.startIso)}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Probezeit Ende:</span>{' '}
                        <strong style={{ color: isCrit ? '#dc2626' : '#0f172a' }}>{formatDate(e.probeEndIso)}</strong>
                      </div>
                    </div>

                    {e.pkStart && (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#5b21b6', fontWeight: 600 }}>
                        🎓 Praktikum: {formatDate(e.pkStart)} – {formatDate(e.pkEnd)}
                      </div>
                    )}

                    <div style={{ height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', marginTop: 8 }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: isCrit ? '#dc2626' : isWarn ? '#f59e0b' : '#0284c7',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* 3. Master Employee Overview Table (Salary, Contracts, Probezeit, Praktikum & DSGVO Status) */}
      <div className="glass-panel" style={{ padding: 0, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <strong style={{ fontSize: 14, color: '#0f172a' }}>
            Mitarbeiter-Gesamtübersicht: Gehälter, Vertragsarten, Probezeit &amp; Vertragsstatus ({filteredList.length})
          </strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="Suchen (Name, Rolle, Nr.)..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              style={{ width: 210, fontSize: 12 }}
            />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
              <option value="ALL">Alle Vertragsarten ({enrichedEmployees.length})</option>
              <option value="Full-time">Full-time (Vollzeit)</option>
              <option value="Part-time">Part-time (Teilzeit)</option>
              <option value="Minijob">Minijob</option>
              <option value="Subunternehmer">Subunternehmer (Werkvertrag)</option>
              <option value="Freelancer">Freelancer</option>
              <option value="Candidate">Candidate / Praktikant</option>
            </select>
            <select value={filterProbezeit} onChange={(e) => setFilterProbezeit(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
              <option value="ALL">Probezeit: Alle</option>
              <option value="IN_PROBEZEIT">Laufende Probezeit ({stats.inProbezeit.length})</option>
              <option value="ENDING_SOON">⚠️ Probezeit endet ≤ 30 Tage ({stats.criticalProbezeit.length})</option>
              <option value="PASSED">✓ Probezeit bestanden</option>
              <option value="PRAKTIKUM">🎓 Mit Orientierungspraktikum ({stats.withPraktikum})</option>
            </select>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                downloadCsv(
                  {
                    rows: filteredList,
                    columns: [
                      { key: 'employee_number', label: 'Personal-Nr.' },
                      { key: 'full_name', label: 'Mitarbeiter' },
                      { key: 'role', label: 'Position' },
                      { key: 'department', label: 'Abteilung' },
                      { key: 'employment_type', label: 'Vertragsart' },
                      { key: 'weeklyHours', label: 'Wochenstunden' },
                      { key: 'base_salary', label: 'Bruttogehalt EUR' },
                      { key: 'annual_leave_days', label: 'Urlaubstage' },
                      { key: 'startIso', label: 'Vertragsbeginn' },
                      { key: 'probeEndIso', label: 'Probezeit Ende' },
                      { label: 'Probezeit Resttage', fn: (r) => r.probeDaysLeft ?? '' },
                      { key: 'pkStart', label: 'Praktikum Von' },
                      { key: 'pkEnd', label: 'Praktikum Bis' },
                      { key: 'signedCount', label: 'Verträge Unterschrieben' },
                      { key: 'pendingCount', label: 'Verträge Ausstehend' },
                    ],
                  },
                  `bruenel_hr_employee_overview_${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
            >
              <Download size={13} /> CSV Export
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#475569', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Mitarbeiter</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Position &amp; Abteilung</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Vertragsart &amp; Std.</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Gehalt Brutto / Satz</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Vertragsbeginn</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Probezeit Ende &amp; Frist</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Orientierungspraktikum</th>
                <th style={{ padding: '9px 10px', textAlign: 'left' }}>Verträge &amp; DSGVO</th>
                <th style={{ padding: '9px 10px', textAlign: 'right' }}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((e) => {
                const isSub = ['Freelancer', 'Subunternehmer'].includes(e.employment_type);
                const attr = e.attributes || {};
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px' }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{e.full_name}</div>
                      <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{e.employee_number}</div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{e.role}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{e.department}</div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: isSub ? '#fff7ed' : '#ecfdf5', color: isSub ? '#c2410c' : '#047857' }}>
                        {e.employment_type}
                      </span>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        {isSub ? (attr.contract_model || 'Werkvertrag §631 BGB') : `${e.weeklyHours} h/Wo · ${e.annual_leave_days || 24} Tage Urlaub`}
                      </div>
                    </td>
                    <td style={{ padding: '10px', fontWeight: 800, color: '#0f172a' }}>
                      {e.employment_type === 'Subunternehmer' ? (
                        <div>
                          <div>Var. A: {formatEuro(attr.sub_rate_variante_a ?? 40)}/WE</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Var. B: {formatEuro(attr.sub_rate_variante_b ?? 35)}/WE</div>
                        </div>
                      ) : e.employment_type === 'Freelancer' ? (
                        <div>{formatEuro(attr.tagessatz || 640)}/Tag</div>
                      ) : (
                        <div>
                          <div style={{ color: '#047857' }}>{formatEuro(e.base_salary || 0)} / Mo</div>
                          <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>{formatEuro(e.hourly_rate || 0)} / Std.</div>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px', fontWeight: 600 }}>
                      {e.startIso ? formatDate(e.startIso) : '—'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {!e.probeEndIso || isSub ? (
                        <span style={{ color: '#94a3b8', fontSize: 11.5 }}>— (Kein ArbV)</span>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 700, color: e.probeStatus === 'CRITICAL' ? '#dc2626' : '#0f172a' }}>
                            {formatDate(e.probeEndIso)}
                          </div>
                          {e.probeStatus === 'CRITICAL' && (
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#dc2626' }}>
                              🔴 Endet in {e.probeDaysLeft} Tagen!
                            </span>
                          )}
                          {e.probeStatus === 'WARNING' && (
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#d97706' }}>
                              🟠 Endet in {e.probeDaysLeft} Tagen
                            </span>
                          )}
                          {e.probeStatus === 'ACTIVE' && (
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#0284c7' }}>
                              🔵 Noch {e.probeDaysLeft} Tage
                            </span>
                          )}
                          {e.probeStatus === 'PASSED' && (
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d' }}>
                              ✓ Probezeit bestanden
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {e.pkStart ? (
                        <div>
                          <div style={{ fontWeight: 700, color: '#5b21b6', fontSize: 11.5 }}>
                            {formatDate(e.pkStart)} – {formatDate(e.pkEnd)}
                          </div>
                          <span style={{ fontSize: 10.5, color: e.pkDaysLeft >= 0 ? '#7c3aed' : '#64748b', fontWeight: 700 }}>
                            {e.pkDaysLeft >= 0 ? `Aktiv (noch ${e.pkDaysLeft} T.)` : 'Abgeschlossen'}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 11.5 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {e.signedCount > 0 && (
                            <span style={{ padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#15803d', fontSize: 10.5, fontWeight: 800 }}>
                              ✓ {e.signedCount} Signiert
                            </span>
                          )}
                          {e.pendingCount > 0 && (
                            <span style={{ padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#b45309', fontSize: 10.5, fontWeight: 800 }}>
                              ⏳ {e.pendingCount} Ausstehend
                            </span>
                          )}
                          {e.signedCount === 0 && e.pendingCount === 0 && (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Kein Vertrag</span>
                          )}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: e.hasDsgvoSigned ? '#047857' : '#d97706' }}>
                          {e.hasDsgvoSigned ? '🔒 DSGVO unterschrieben' : '⚠️ DSGVO ausstehend'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {effectiveJumpToContract && (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            style={{ padding: '5px 9px', fontSize: 11, fontWeight: 700 }}
                            onClick={() => effectiveJumpToContract(e.id)}
                          >
                            <FileText size={12} /> Vertrag
                          </button>
                        )}
                        {effectiveOpenEmpModal && (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            style={{ padding: '5px 9px', fontSize: 11 }}
                            onClick={() => effectiveOpenEmpModal(e)}
                          >
                            Akte
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
