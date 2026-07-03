import { load_bundle, ensure_stylesheet, create_block_helpers } from "./shared.js";
import {
  rankedPartyUnits,
  winningPartyLegendScale,
  partyShareVsNationalUnits,
  scalarStatisticVsNationalUnits,
  nationalStatisticValue,
  divergingLegendScale,
  absoluteLegendScale,
} from "./lib/choroplethKpis.js";
import { choroplethCard } from "./lib/choroplethCard.js";
import { partyRankCard } from "./lib/partyRankCard.js";

const LEVEL_LABELS = {
  kallikratis: "Δήμοι (Καλλικράτης)",
  kapodistrias: "Κοινότητες (Καποδίστριας)",
  eklogiki_perifereia0: "Εκλογικές Περιφέρειες",
};

const KPI_LABELS = {
  oxi: "Ποσοστό ΟΧΙ",
  nai: "Ποσοστό ΝΑΙ",
  invalidBlank: "Λευκά + Άκυρα",
  turnout: "Συμμετοχή",
};

const MODE_LABELS = {
  relative: "Σε σχέση με Εθνική Τιμή",
  absolute: "Απόλυτη Τιμή",
};

/**
 * Builds the full "under the surface" article on the 2015 Greek referendum
 * — mirrors kino's `createKinoArticle({Inputs, html, md})` shape so it can
 * be dropped into an Observable notebook cell the same way:
 *
 *   article = {
 *     const {createReferendum2015Article} = await import("https://cdn.jsdelivr.net/gh/xanthopoulakis/observablehq@main/referendum2015/article.js");
 *     return createReferendum2015Article({Inputs, html, md});
 *   }
 */
export async function createReferendum2015Article({ Inputs, html, md }) {
  const bundle = await load_bundle();
  const { d3, stylesheet, parties, national, unitsByLevel } = bundle;
  ensure_stylesheet(html, stylesheet);
  const { block, markdown_block, heading_block } = create_block_helpers({ html, md });

  const formatPercent = d3.format(".2%");
  const formatPercent1 = d3.format(".1%");
  const formatVotes = d3.format(",d");

  const nationalShareByParty = new Map(national.parties.map((p) => [p.party_id, p.party_percentage]));
  const nationalOxiShare = nationalShareByParty.get(101);
  const nationalNaiShare = nationalShareByParty.get(102);
  const turnout = (national.stats.valid_votes + national.stats.invalid_votes + national.stats.blank_votes) / national.stats.registered;
  const invalidBlank = (national.stats.invalid_votes + national.stats.blank_votes) / (national.stats.valid_votes + national.stats.invalid_votes + national.stats.blank_votes);

  // How lopsided the *unit-count* looks nationwide (the "everyone has seen
  // this map" framing) — computed once from the kallikratis level, since
  // that's the map this framing paragraph refers to.
  const kallikratisWinners = rankedPartyUnits(unitsByLevel.kallikratis, 1, "el", formatPercent);
  const oxiUnitWins = kallikratisWinners.filter((d) => d.fill === parties.oxi.color).length;

  const full_width = Math.min(1100, Math.max(720, window.innerWidth - 180));

  const root = html`<div class="r2015-article"></div>`;
  const body = html`<div></div>`;

  // ── Hero ──────────────────────────────────────────────────────────────
  body.append(
    html`<section class="hero">
      <div class="kicker">Δημοψήφισμα 5 Ιουλίου 2015</div>
      <h1>Η Ελλάδα κάτω από το πορτοκαλί</h1>
      <div class="deck">
        ${md`Το ΟΧΙ κέρδισε με ${formatPercent1(nationalOxiShare)} έναντι ${formatPercent1(nationalNaiShare)} — μια νίκη τόσο μεγάλη
        που ο εκλογικός χάρτης της χώρας βάφτηκε σχεδόν ολόκληρος πορτοκαλί. Αυτή είναι η εικόνα που έμεινε.
        Από κοντά, όμως, ο χάρτης λέει μια πολύ πιο σύνθετη ιστορία.`}
      </div>
      <div class="meta">${formatVotes(national.stats.registered)} εγγεγραμμένοι ψηφοφόροι · ${formatVotes(national.stats.valid_votes + national.stats.invalid_votes + national.stats.blank_votes)} ψηφίσαντες</div>
    </section>`,
  );

  body.append(
    markdown_block(
      `Όλοι έχουν δει τον χάρτη του δημοψηφίσματος του 2015: σχεδόν ολόκληρη η Ελλάδα βαμμένη στο πορτοκαλί του ΟΧΙ,
      με ελάχιστες γαλάζιες νησίδες ΝΑΙ να ξεχωρίζουν. Αυτή η εικόνα δεν είναι λάθος — αλλά είναι ημιτελής.
      Οι πραγματικές ιστορίες αυτού του δημοψηφίσματος κρύβονται κάτω από την επιφάνεια: ποιος ψήφισε αλλιώς,
      πού, και πόσο έντονα.`,
    ),
  );

  body.append(
    html`<div class="mini-grid">
      <div class="mini-card">
        <div class="label">ΟΧΙ</div>
        <div class="value">${formatPercent1(nationalOxiShare)}</div>
      </div>
      <div class="mini-card">
        <div class="label">ΝΑΙ</div>
        <div class="value">${formatPercent1(nationalNaiShare)}</div>
      </div>
      <div class="mini-card">
        <div class="label">Συμμετοχή</div>
        <div class="value">${formatPercent1(turnout)}</div>
      </div>
      <div class="mini-card">
        <div class="label">Λευκά + Άκυρα</div>
        <div class="value">${formatPercent1(invalidBlank)}</div>
      </div>
    </div>`,
  );

  const rankChart = partyRankCard({ title: "Αποτελέσματα", subtitle: "Πανελλαδικά αποτελέσματα κατά ψήφους" });
  rankChart.update(national.parties);
  body.append(block(rankChart, "plot-block"));

  // ── "The map everyone remembers" ───────────────────────────────────────
  body.append(heading_block("Ο χάρτης που όλοι θυμούνται"));
  body.append(
    markdown_block(
      `Δήμος-δήμος, ποιος νίκησε; Σε ${oxiUnitWins} από τους ${kallikratisWinners.length} δήμους της χώρας (${formatPercent1(oxiUnitWins / kallikratisWinners.length)})
      επικράτησε το ΟΧΙ. Μόνο ${kallikratisWinners.length - oxiUnitWins} δήμοι ψήφισαν ΝΑΙ — αρκετά λίγοι ώστε ο χάρτης να μοιάζει σχεδόν ομοιόμορφος.`,
    ),
  );

  const winnerMap = choroplethCard({ title: "Νικητής ανά δήμο", width: full_width });
  const winnerScale = winningPartyLegendScale(kallikratisWinners);
  winnerMap.update(kallikratisWinners, winnerScale, { legendStyle: "swatches" });
  body.append(block(winnerMap, "plot-block"));

  body.append(
    html`<div class="callout">
      <strong class="callout-title">Με απλά λόγια</strong>
      ${md`Ένας χάρτης «ποιος κέρδισε» κρύβει το μέγεθος — ο Δήμος Φιλοθέης-Ψυχικού και ο Δήμος Ικαρίας μετράνε από
      μία μπλε/πορτοκαλί περιοχή ο καθένας, παρότι η πραγματική διαφορά ανάμεσά τους ξεπερνά τις 50 ποσοστιαίες μονάδες.`}
    </div>`,
  );

  // ── "Under the surface" ────────────────────────────────────────────────
  body.append(heading_block("Κάτω από την επιφάνεια"));
  body.append(
    markdown_block(
      `Η πραγματική γεωγραφία του δημοψηφίσματος δεν είναι «ΟΧΙ εναντίον ΝΑΙ» αλλά **πόσο πάνω ή κάτω από τον εθνικό
      μέσο όρο** ψήφισε κάθε περιοχή. Επιλέξτε επίπεδο, δείκτη, και τρόπο απεικόνισης παρακάτω για να δείτε πού
      πραγματικά διαφέρει η Ελλάδα από το εθνικό 61,31%–38,69%.`,
    ),
  );

  const levelInput = Inputs.radio(Object.keys(LEVEL_LABELS), {
    value: "kallikratis",
    format: (d) => LEVEL_LABELS[d],
    label: "Επίπεδο",
  });
  const kpiInput = Inputs.radio(Object.keys(KPI_LABELS), {
    value: "oxi",
    format: (d) => KPI_LABELS[d],
    label: "Δείκτης",
  });
  const modeInput = Inputs.radio(Object.keys(MODE_LABELS), {
    value: "relative",
    format: (d) => MODE_LABELS[d],
    label: "Προβολή Τιμής",
  });

  body.append(
    html`<div class="map-toolbar">${levelInput}${kpiInput}${modeInput}</div>`,
  );

  const underMap = choroplethCard({ title: "Κατανομή ανά περιοχή", width: full_width });
  body.append(block(underMap, "plot-block"));

  function renderUnderMap() {
    const level = levelInput.value;
    const kpi = kpiInput.value;
    const mode = modeInput.value;
    const rows = unitsByLevel[level];
    const useAbsolute = mode === "absolute";

    let raw, refValue;
    if (kpi === "oxi") {
      raw = partyShareVsNationalUnits(rows, 101, nationalOxiShare, "el", formatPercent, "Απόκλιση");
      refValue = nationalOxiShare;
    } else if (kpi === "nai") {
      raw = partyShareVsNationalUnits(rows, 102, nationalNaiShare, "el", formatPercent, "Απόκλιση");
      refValue = nationalNaiShare;
    } else if (kpi === "invalidBlank") {
      raw = scalarStatisticVsNationalUnits(rows, "invalidBlank", national.stats, "el", formatPercent, KPI_LABELS.invalidBlank, "Απόκλιση");
      refValue = nationalStatisticValue("invalidBlank", national.stats);
    } else {
      raw = scalarStatisticVsNationalUnits(rows, "turnout", national.stats, "el", formatPercent, KPI_LABELS.turnout, "Απόκλιση");
      refValue = nationalStatisticValue("turnout", national.stats);
    }

    const modeTitle = useAbsolute ? "Απόλυτη Τιμή" : "Σε σχέση με Εθνική Τιμή";
    const legendTitle = `${modeTitle} (${formatPercent(refValue)})`;

    const sharedScale = useAbsolute
      ? absoluteLegendScale(raw, d3.schemeBlues[6])
      : divergingLegendScale(raw, [...d3.schemeRdYlBu[6]].reverse());
    const scaleValue = useAbsolute ? (d) => d.value : (d) => d.vs_national_pct;
    const unitsData = raw.map((d) => ({ ...d, fill: sharedScale(scaleValue(d)) }));

    underMap.update(unitsData, sharedScale, {
      subtitle: `${LEVEL_LABELS[level]} — ${KPI_LABELS[kpi]}`,
      unitLevel: level,
      legendTitle,
      legendTickFormat: useAbsolute ? ".1%" : "+.1%",
    });
  }

  levelInput.addEventListener("input", renderUnderMap);
  kpiInput.addEventListener("input", renderUnderMap);
  modeInput.addEventListener("input", renderUnderMap);
  renderUnderMap();

  // ── The real stories ────────────────────────────────────────────────────
  body.append(heading_block("Η γεωγραφία της ψήφου", 3));
  body.append(
    markdown_block(
      `Στην κορυφή του ΟΧΙ βρίσκεται η **Ικαρία** (79,5%), ιστορικά μια από τις πιο αριστερές περιοχές της χώρας.
      Ακολουθούν δήμοι της εργατικής/βιομηχανικής δυτικής Αττικής — **Ασπρόπυργος** (79,2%), **Φυλή** (77,2%),
      **Πέραμα** (76,6%) και **Αχαρνές** (75,2%) — όλοι πάνω από τον εθνικό μέσο όρο κατά 15+ μονάδες.

      Στον αντίποδα, η χαμηλότερη ψήφος ΟΧΙ καταγράφεται στη **Φιλοθέη-Ψυχικό** (28,2% — δηλαδή 71,8% ΝΑΙ),
      με τα **Κηφισιά** (36,1%), **Βάρη-Βούλα-Βουλιαγμένη** (39,3%), **Παπάγου-Χολαργός** (42,7%) και
      **Βριλήσσια** (43,8%) να ακολουθούν. Η απόσταση ανάμεσα σε Ικαρία και Φιλοθέη-Ψυχικό ξεπερνά τις 51
      ποσοστιαίες μονάδες — μια διαφορά αόρατη σε έναν χάρτη δύο χρωμάτων.`,
    ),
  );

  body.append(
    markdown_block(
      `Μόλις 28 από τους 325 δήμους ψήφισαν ΝΑΙ, και χωρίζονται σε τρεις αναγνωρίσιμες ομάδες. Οι 12 είναι εύποροι
      δήμοι του λεκανοπεδίου (Αγία Παρασκευή, Αμαρούσι, Βριλήσσια, Κηφισιά, Παπάγου-Χολαργός, Πεντέλη,
      Φιλοθέη-Ψυχικό, Χαλάνδρι, Γλυφάδα, Παλαιό Φάληρο, Βάρη-Βούλα-Βουλιαγμένη, Διόνυσος). Άλλοι 7 είναι μικρά
      νησιά και παράκτιοι δήμοι (Σπέτσες και Οινούσσες, με ιστορική παράδοση σε εφοπλιστικές οικογένειες, μαζί με
      Κάσο, Αγαθονήσι, Φούρνους Κορσεών, Ανατολική Μάνη και Νότια Κυνουρία). Οι υπόλοιποι 9 είναι αγροτικοί/παραμεθόριοι
      δήμοι στη Μακεδονία-Θράκη-Θεσσαλία (Διδυμότειχο, Ορεστιάδα, Αμφίπολη, Νέα Ζίχνη, Νεστόριο, Βόιο, Πρέσπες,
      Αργιθέα, Δωρίδα) — μια γεωγραφία που δεν χωράει σε μια απλή αφήγηση «πλούσιοι εναντίον φτωχών».`,
    ),
  );

  body.append(heading_block("Ποιος ψήφισε — και ποιος όχι", 3));
  body.append(
    markdown_block(
      `Η συμμετοχή είχε τη δική της γεωγραφία, και συχνά ταυτίζεται με τη γεωγραφία του ΝΑΙ: ο **Διόνυσος**
      είχε την υψηλότερη συμμετοχή της χώρας (81,0%), με **Παλλήνη** (78,4%) και **Βριλήσσια** (78,0%) αμέσως
      πίσω — τα ίδια προάστια που έκλιναν προς το ΝΑΙ φαίνεται πως και ψήφισαν περισσότερο. Στον αντίποδα, οι
      **Πρέσπες** (21,3%) και ο **Άγιος Ευστράτιος** (22,9%) κατέγραψαν τη χαμηλότερη συμμετοχή — μικρές,
      απομακρυσμένες κοινότητες όπου η απόσταση από την κάλπη μετράει διπλά.`,
    ),
  );

  body.append(
    html`<div class="callout">
      <strong class="callout-title">Με απλά λόγια</strong>
      ${md`Τα ποσοστά λευκών/άκυρων εκτοξεύονται σε πολύ μικρούς δήμους (π.χ. Μεγίστη 25,3%) όχι επειδή εκεί
      υπήρξε ασυνήθιστη διαμαρτυρία, αλλά επειδή λίγες εκατοντάδες ψηφοφόροι αρκούν για να μετακινήσουν ένα
      ποσοστό κατά πολλές μονάδες. Σε τόσο μικρούς πληθυσμούς, τα ακραία ποσοστά χρειάζονται προσοχή πριν
      διαβαστούν ως "μήνυμα".`}
    </div>`,
  );

  body.append(heading_block("Επίλογος", 3));
  body.append(
    markdown_block(
      `Ο πορτοκαλί χάρτης του 2015 λέει αλήθεια — το ΟΧΙ κέρδισε καθαρά, σχεδόν παντού. Αλλά "παντού" δεν
      σημαίνει "εξίσου παντού". Κάτω από την ομοιομορφία της νίκης κρύβεται μια χώρα διαιρεμένη κατά τάξη,
      γεωγραφία και ηλικία του εκλογικού σώματος — μια διαίρεση που ένας χάρτης δύο χρωμάτων απλά δεν μπορεί
      να δείξει.`,
    ),
  );

  body.append(heading_block("Πηγές & μεθοδολογία", 4));
  body.append(
    markdown_block(
      `Τα δεδομένα προέρχονται από το επίσημο αρχείο αποτελεσμάτων του Υπουργείου Εσωτερικών
      (ekloges-prev.singularlogic.eu/r2015), όπως έχουν συγκεντρωθεί και κανονικοποιηθεί στο
      [election-atlas](https://github.com/xanthopoulakis/election-atlas) (\`common/raw/ypes/r2015\`). Τα χρώματα
      και τα λογότυπα του ΟΧΙ/ΝΑΙ προέρχονται από το επίσημο \`legend.js\` και τις εικόνες κομμάτων του ίδιου
      site. Οι χάρτες και το γράφημα αποτελεσμάτων είναι προσαρμογή των αντίστοιχων components του
      election-atlas (\`apps/framework/src/components\`), προσαρμοσμένα ώστε να τρέχουν αυτόνομα εδώ.`,
    ),
  );

  root.replaceChildren(body);
  return root;
}
