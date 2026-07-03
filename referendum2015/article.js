import {
  load_bundle,
  ensure_stylesheet,
  create_block_helpers
} from "./shared.js";
import {
  rankedPartyUnits,
  winningPartyLegendScale,
  partyShareVsNationalUnits,
  scalarStatisticVsNationalUnits,
  nationalStatisticValue,
  partyMarginUnits,
  divergingLegendScale,
  absoluteLegendScale
} from "./lib/choroplethKpis.js";
import { choroplethCard } from "./lib/choroplethCard.js";
import { partyRankCard } from "./lib/partyRankCard.js";

const OXI_ID = 101;
const NAI_ID = 102;

/**
 * Builds the full "Ανατομία ενός Δημοψηφίσματος" article on the 2015 Greek
 * referendum — mirrors kino's `createKinoArticle({Inputs, html, md})` shape
 * so it can be dropped into an Observable notebook cell the same way:
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
  const { block, markdown_block, heading_block } = create_block_helpers({
    html,
    md
  });

  const formatPercent = d3.format(".2%");
  const formatPercent1 = d3.format(".1%");
  const formatVotes = d3.format(",d");

  const nationalShareByParty = new Map(
    national.parties.map((p) => [p.party_id, p.party_percentage])
  );
  const nationalOxiShare = nationalShareByParty.get(OXI_ID);
  const nationalNaiShare = nationalShareByParty.get(NAI_ID);
  const turnout =
    (national.stats.valid_votes +
      national.stats.invalid_votes +
      national.stats.blank_votes) /
    national.stats.registered;
  const invalidBlank =
    (national.stats.invalid_votes + national.stats.blank_votes) /
    (national.stats.valid_votes +
      national.stats.invalid_votes +
      national.stats.blank_votes);

  const full_width = Math.min(1100, Math.max(720, window.innerWidth - 180));

  const root = html`<div class="r2015-article"></div>`;
  const body = html`<div></div>`;

  // ── Hero ──────────────────────────────────────────────────────────────
  body.append(
    html`<section class="hero">
      <div class="kicker">ΔΗΜΟΨΗΦΙΣΜΑ 5 ΙΟΥΛΙΟΥ 2015</div>
      <h1>11 χρόνια μετά: Η Ανατομία του Δημοψηφίσματος του 2015</h1>
      <div class="deck">
        ${md`Το ΟΧΙ κέρδισε με ${formatPercent1(nationalOxiShare)} έναντι ${formatPercent1(nationalNaiShare)} — μια νίκη τόσο εμφατική
        που ο εκλογικός χάρτης της χώρας βάφτηκε μονόχρωμος. Αυτή είναι η εικόνα που έμεινε στο ευρύ κοινό.
        Από κοντά, όμως, ο χάρτης λέει μια πολύ πιο σύνθετη ιστορία.`}
      </div>
      <div class="meta">
        ${formatVotes(national.stats.registered)} εγγεγραμμένοι ψηφοφόροι ·
        ${formatVotes(
          national.stats.valid_votes +
            national.stats.invalid_votes +
            national.stats.blank_votes
        )}
        ψηφίσαντες
      </div>
    </section>`
  );

  body.append(
    markdown_block(
      `Όλοι έχουν δει τον χάρτη του δημοψηφίσματος του 2015: σχεδόν ολόκληρη η Ελλάδα βαμμένη στο πορτοκαλί του ΟΧΙ,
      δημιουργώντας την ψευδαίσθηση μιας ομοιομορφίας. Αυτή η εικόνα όμως είναι ημιτελής. Οι πραγματικές ιστορίες αυτού του δημοψηφίσματος
      κρύβονται κάτω από την επιφάνεια: ποιος ψήφισε διαφορετικά, πού, και πόσο έντονα.`
    )
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
    </div>`
  );

  const rankChart = partyRankCard({
    title: "Αποτελέσματα",
    subtitle: "Πανελλαδικά αποτελέσματα κατά ψήφους"
  });
  rankChart.update(national.parties);
  body.append(block(rankChart, "plot-block"));

  // ── "The map everyone remembers" — three levels of zoom ────────────────
  body.append(heading_block("Ο χάρτης που όλοι θυμούνται"));
  body.append(
    markdown_block(
      `Ο ίδιος χάρτης αλλάζει πρόσωπο ανάλογα με το πόσο κοντά κοιτάς. Ξεκινάμε από το πιο αδρό επίπεδο — τις
      εκλογικές περιφέρειες — και ζουμάρουμε σταδιακά μέχρι τις κοινότητες.`
    )
  );

  body.append(heading_block("Εκλογικές Περιφέρειες", 3));
  const epWinners = rankedPartyUnits(
    unitsByLevel.eklogiki_perifereia0,
    1,
    "el",
    formatPercent
  );
  const epNaiWins = epWinners.filter(
    (d) => d.fill === parties.nai.color
  ).length;
  body.append(
    markdown_block(
      `Σε επίπεδο εκλογικής περιφέρειας, ο χάρτης είναι απόλυτα ομοιόμορφος: το ΝΑΙ δεν κέρδισε **καμία** από τις
      ${epWinners.length} περιφέρειες της χώρας. Εδώ ακριβώς είναι και το πρόβλημα αυτού του χάρτη: η πιο ισόπαλη
      περιφέρεια, η **Λακωνία** (51,2% ΟΧΙ — ουσιαστικά ισοπαλία), βάφεται με το ίδιο ακριβώς πορτοκαλί με την πιο
      μονόπλευρη περιφέρεια της χώρας. Ένας χάρτης 56 μεγάλων περιοχών δεν μπορεί να δείξει τη διαφορά ανάμεσα σε
      μια δύσκολη νίκη και σε μια συντριβή — πόσο μάλλον οτιδήποτε συμβαίνει *μέσα* σε κάθε περιφέρεια.`
    )
  );
  const epMap = choroplethCard({
    title: "Νικητής ανά εκλογική περιφέρεια",
    width: full_width
  });
  const epScale = winningPartyLegendScale(epWinners);
  epMap.update(epWinners, epScale, {
    legendStyle: "swatches",
    unitLevel: "eklogiki_perifereia0"
  });
  body.append(block(epMap, "plot-block"));

  body.append(heading_block("Δήμοι (Καλλικράτης)", 3));
  const kallikratisWinners = rankedPartyUnits(
    unitsByLevel.kallikratis,
    1,
    "el",
    formatPercent
  );
  const oxiUnitWins = kallikratisWinners.filter(
    (d) => d.fill === parties.oxi.color
  ).length;
  body.append(
    markdown_block(
      `Ζουμάροντας στους ${kallikratisWinners.length} δήμους της χώρας, οι πρώτες ρωγμές εμφανίζονται: το ΝΑΙ
      κερδίζει πλέον σε ${kallikratisWinners.length - oxiUnitWins} δήμους (το ΟΧΙ στους υπόλοιπους
      ${oxiUnitWins}, δηλαδή ${formatPercent1(oxiUnitWins / kallikratisWinners.length)}). Ακόμα λίγοι, ώστε ο χάρτης
      να μοιάζει σχεδόν ομοιόμορφος — αλλά αρκετοί για να αρχίσει να φαίνεται μια κάποια γεωγραφία.`
    )
  );
  const kallikratisMap = choroplethCard({
    title: "Νικητής ανά δήμο",
    width: full_width
  });
  const kallikratisScale = winningPartyLegendScale(kallikratisWinners);
  kallikratisMap.update(kallikratisWinners, kallikratisScale, {
    legendStyle: "swatches",
    unitLevel: "kallikratis"
  });
  body.append(block(kallikratisMap, "plot-block"));
  body.append(
    html`<div class="callout">
      <strong class="callout-title">Με απλά λόγια</strong>
      ${md`
Ο Δήμος Φιλοθέης-Ψυχικού και ο Δήμος Ικαρίας μετράνε από μία περιοχή ο καθένας
σε αυτόν τον χάρτη, παρότι η πραγματική διαφορά ανάμεσά τους ξεπερνά τις 51
ποσοστιαίες μονάδες (79,5% έναντι 28,2% ΟΧΙ).`}
    </div>`
  );

  body.append(heading_block("Κοινότητες (Καποδίστριας)", 3));
  const kapodistriasWinners = rankedPartyUnits(
    unitsByLevel.kapodistrias,
    1,
    "el",
    formatPercent
  );
  body.append(
    markdown_block(
      `Ένα ακόμα βήμα πιο κοντά, στις ${kapodistriasWinners.length} κοινότητες της προ-Καλλικράτειας διαίρεσης,
      αποκαλύπτεται κάτι που ο δημοτικός χάρτης δεν μπορούσε να δείξει: **82 κοινότητες ψήφισαν αντίθετα από τον
      δικό τους δήμο**. Στον εργατικό Δήμο Αχαρνών (75,2% ΟΧΙ), η κοινότητα των **Θρακομακεδόνων** —μια από τις πιο
      εύπορες γειτονιές της Αττικής— ψήφισε 56,9% ΝΑΙ. Στον οριακά ΟΧΙ Δήμο Λυκόβρυσης-Πεύκης (52,1% ΟΧΙ), η
      κοινότητα της **Πεύκης** γύρισε προς το ΝΑΙ (50,6%). Το ίδιο μοτίβο, μια τάξη μεγέθους πιο υψηλή.`
    )
  );
  const kapodistriasMap = choroplethCard({
    title: "Νικητής ανά κοινότητα",
    width: full_width
  });
  const kapodistriasScale = winningPartyLegendScale(kapodistriasWinners);
  kapodistriasMap.update(kapodistriasWinners, kapodistriasScale, {
    legendStyle: "swatches",
    unitLevel: "kapodistrias"
  });
  body.append(block(kapodistriasMap, "plot-block"));

  // ── OXI share: absolute, then relative to the national result ──────────
  body.append(heading_block("Ποσοστό ΟΧΙ: σε απόλυτες και σχετικές τιμές"));
  body.append(
    markdown_block(
      `Το ποσοστό ΟΧΙ σε κάθε δήμο (και το συμπληρωματικό του, το ποσοστό ΝΑΙ, αφού οι δύο μαζί κάνουν πάντα 100%)
      μπορεί να διαβαστεί με δύο τρόπους: **απόλυτα** — πόσο υψηλό ήταν το ΟΧΙ εκεί — ή **σχετικά** — πόσο πάνω ή
      κάτω από το εθνικό 61,31% βρέθηκε. Οι δύο χάρτες δείχνουν το ίδιο ακριβώς νούμερο, αλλά λένε διαφορετικές
      ιστορίες.`
    )
  );

  const oxiShareRows = partyShareVsNationalUnits(
    unitsByLevel.kallikratis,
    OXI_ID,
    nationalOxiShare,
    "el",
    formatPercent,
    "Απόκλιση"
  );

  const oxiAbsoluteMap = choroplethCard({
    title: "Ποσοστό ΟΧΙ — απόλυτη τιμή",
    width: full_width
  });
  const oxiAbsoluteScale = absoluteLegendScale(
    oxiShareRows,
    d3.schemeOranges[6]
  );
  oxiAbsoluteMap.update(
    oxiShareRows.map((d) => ({ ...d, fill: oxiAbsoluteScale(d.value) })),
    oxiAbsoluteScale,
    {
      legendTitle: `Απόλυτη Τιμή (${formatPercent(nationalOxiShare)})`,
      legendTickFormat: ".1%",
      unitLevel: "kallikratis"
    }
  );
  body.append(block(oxiAbsoluteMap, "plot-block"));
  body.append(
    markdown_block(
      `Σε απόλυτες τιμές, ο χάρτης δείχνει πού το ΟΧΙ ήταν πραγματικά ισχυρό — η δυτική Αττική, η Ικαρία, μεγάλο
      μέρος της περιφέρειας — έναντι μιας χούφτας περιοχών όπου έμεινε κάτω από το 50%.`
    )
  );

  const oxiRelativeMap = choroplethCard({
    title: "Ποσοστό ΟΧΙ — σε σχέση με την εθνική τιμή",
    width: full_width
  });
  const oxiRelativeScale = divergingLegendScale(
    oxiShareRows,
    [...d3.schemeRdYlBu[6]].reverse()
  );
  oxiRelativeMap.update(
    oxiShareRows.map((d) => ({
      ...d,
      fill: oxiRelativeScale(d.vs_national_pct)
    })),
    oxiRelativeScale,
    {
      legendTitle: `Σε σχέση με Εθνική Τιμή (${formatPercent(nationalOxiShare)})`,
      legendTickFormat: "+.1%",
      unitLevel: "kallikratis"
    }
  );
  body.append(block(oxiRelativeMap, "plot-block"));
  body.append(
    markdown_block(
      `Σε σχετικές τιμές, όμως, αναδύεται η πραγματική γεωγραφία της ψήφου: ένα καθαρό μπλε σύμπλεγμα γύρω από τα
      βόρεια προάστια της Αθήνας — όπου το ΟΧΙ υποχώρησε δεκάδες μονάδες κάτω από το εθνικό ποσοστό — απέναντι
      σε ένα κόκκινο σύμπλεγμα στη δυτική Αττική και σε αγροτικές/νησιωτικές περιοχές, όπου το ΟΧΙ ξεπέρασε κατά
      πολύ τον εθνικό μέσο όρο.`
    )
  );

  // ── The OXI-NAI margin ──────────────────────────────────────────────────
  body.append(heading_block("Η διαφορά ΟΧΙ - ΝΑΙ"));
  body.append(
    markdown_block(
      `Πέρα από το "ποιος κέρδισε" ή το "πόσο πάνω από τον εθνικό μέσο όρο", υπάρχει μια τρίτη ερώτηση: πόσο κοντά
      ήταν η μάχη σε κάθε δήμο; Ο παρακάτω χάρτης δείχνει τη διαφορά ΟΧΙ-ΝΑΙ απευθείας — πορτοκαλί όπου το ΟΧΙ
      προηγήθηκε, γαλάζιο όπου προηγήθηκε το ΝΑΙ, λευκό όπου η μάχη ήταν σχεδόν ισόπαλη.`
    )
  );
  const marginRows = partyMarginUnits(
    unitsByLevel.kallikratis,
    OXI_ID,
    NAI_ID,
    "el",
    formatPercent,
    "Διαφορά"
  );
  const marginColors = d3.quantize(
    d3.piecewise(d3.interpolateRgb, [
      parties.nai.color,
      "white",
      parties.oxi.color
    ]),
    6
  );
  const marginScale = divergingLegendScale(
    marginRows,
    marginColors,
    (d) => d.margin
  );
  const marginMap = choroplethCard({ title: "ΝΑΙ ← → ΟΧΙ", width: full_width });
  marginMap.update(
    marginRows.map((d) => ({ ...d, fill: marginScale(d.margin) })),
    marginScale,
    {
      legendTitle: "ΝΑΙ ← → ΟΧΙ",
      legendTickFormat: "+.0%",
      unitLevel: "kallikratis"
    }
  );
  body.append(block(marginMap, "plot-block"));
  body.append(
    markdown_block(
      `Οι πιο κοντινές μάχες της χώρας ήταν στο **Διδυμότειχο** (50,0%), τη **Δωρίδα** και τις **Σπέτσες**
      (49,9% η καθεμία), και τις **Πρέσπες** (49,7%) — όλα μέσα σε μία ποσοστιαία μονάδα από την ισοπαλία. Στην
      Αττική, το **Μαρούσι** (49,5%), το **Χαλάνδρι** (49,5%) και η **Γλυφάδα** (49,4%) ήταν τόσο κοντά που λίγες
      εκατοντάδες ψήφοι θα αρκούσαν να αλλάξουν αποτέλεσμα.`
    )
  );

  // ── Λευκά + Άκυρα ────────────────────────────────────────────────────────
  body.append(heading_block("Λευκά + Άκυρα: ένα ιστορικό ρεκόρ"));
  body.append(
    markdown_block(
      `Το ${formatPercent1(invalidBlank)} λευκών και άκυρων ψηφοδελτίων του 2015 δεν είναι απλώς υψηλό — είναι το
      **υψηλότερο ποσοστό σε οποιαδήποτε πανελλαδική εκλογική αναμέτρηση από το 1996 έως το 2024** σύμφωνα με τα δεδομένα
      του Υπουργείου Εσωτερικών, κατά πολύ μεγαλύτερο από τη δεύτερη υψηλότερη τιμή (4,46% στις ευρωεκλογές του 2019) και έως
      και 3 φορές μεγαλύτερο από τυπικές βουλευτικές εκλογές (~2-3%). Οι 357.106 ψηφοφόροι επέλεξαν λευκό ή άκυρο ως μορφή διαμαρτυρίας για την ίδια την φύση του δημοψηφίσματος.`
    )
  );
  const invalidBlankRows = scalarStatisticVsNationalUnits(
    unitsByLevel.kallikratis,
    "invalidBlank",
    national.stats,
    "el",
    formatPercent,
    "Λευκά + Άκυρα",
    "Απόκλιση"
  );
  const invalidBlankScale = absoluteLegendScale(
    invalidBlankRows,
    d3.schemePurples[6]
  );
  const invalidBlankMap = choroplethCard({
    title: "Λευκά + Άκυρα ανά δήμο",
    width: full_width
  });
  invalidBlankMap.update(
    invalidBlankRows.map((d) => ({ ...d, fill: invalidBlankScale(d.value) })),
    invalidBlankScale,
    {
      legendTitle: `Απόλυτη Τιμή (${formatPercent(invalidBlank)})`,
      legendTickFormat: ".1%",
      unitLevel: "kallikratis"
    }
  );
  body.append(block(invalidBlankMap, "plot-block"));
  body.append(
    markdown_block(
      `Στην κορυφή βρίσκεται η **Ικαρία** (11,95%) — που είναι επίσης ο δήμος με το υψηλότερο ΟΧΙ της χώρας, και
      ιστορικά ένα από τα πιο σταθερά προπύργια του ΚΚΕ. Δεν είναι σύμπτωση: το ΚΚΕ κάλεσε επίσημα σε ψήφο λευκού
      ως διαμαρτυρία, χαρακτηρίζοντας το δημοψήφισμα ψευδές δίλημμα ανάμεσα σε δύο εκδοχές της ίδιας πολιτικής.
      Ακολουθούν δήμοι με μεγάλους πληθυσμούς μειονοτήτων στη Θράκη (**Ίασμος** 10,4%, **Μύκη** 9,0%), νησιωτικοί
      δήμοι (Λήμνος, Λέρος, Πάρος, Μήλος, Σκόπελος), αλλά και μεγάλες αστικές περιοχές όπως η **Μυτιλήνη** (8,8%,
      101.512 εγγεγραμμένοι) και η **Καλλιθέα** (8,3%, 79.472 εγγεγραμμένοι) — αρκετά μεγάλες ώστε το φαινόμενο να
      μην εξηγείται απλά από μικρούς πληθυσμούς.`
    )
  );

  // ── Αποχή ────────────────────────────────────────────────────────────────
  body.append(heading_block("Αποχή: η γεωγραφία της απουσίας"));
  body.append(
    markdown_block(
      `Η εθνική συμμετοχή ήταν ${formatPercent1(turnout)}. Οι χαμηλότερες τιμές συγκεντρώνονται σχεδόν αποκλειστικά
      σε παραμεθόριες, ορεινές και νησιωτικές περιοχές — **Πρέσπες** (21,3%), **Άγιος Ευστράτιος** (22,9%),
      **Αργιθέα** (29,8%), **Οινούσσες** (31,0%), **Μεγίστη**/Καστελλόριζο (32,6%), **Νίσυρος** (32,6%) — όπου η
      απόσταση μέχρι την κάλπη μετράει διπλά. Στον αντίποδα, η υψηλότερη συμμετοχή καταγράφηκε σε εύπορα, εύκολα
      προσβάσιμα προάστια της Αθήνας: **Διόνυσος** (81,0%), **Παλλήνη** (78,4%), **Βριλήσσια** (78,0%).`
    )
  );
  const nationalAbstention = nationalStatisticValue(
    "abstention",
    national.stats
  );
  const abstentionRows = scalarStatisticVsNationalUnits(
    unitsByLevel.kapodistrias,
    "abstention",
    national.stats,
    "el",
    formatPercent,
    "Αποχή",
    "Απόκλιση"
  );
  const abstentionScale = absoluteLegendScale(
    abstentionRows,
    d3.schemeGreys[6]
  );
  const abstentionMap = choroplethCard({
    title: "Αποχή ανά κοινότητα",
    width: full_width
  });
  abstentionMap.update(
    abstentionRows.map((d) => ({ ...d, fill: abstentionScale(d.value) })),
    abstentionScale,
    {
      legendTitle: `Απόλυτη Τιμή (${formatPercent(nationalAbstention)})`,
      legendTickFormat: ".1%",
      unitLevel: "kapodistrias"
    }
  );
  body.append(block(abstentionMap, "plot-block"));
  body.append(
    html`<div class="callout">
      <strong class="callout-title">Με απλά λόγια</strong>
      ${md`
Η Αθήνα και ο Πειραιάς οι ίδιοι είχαν συμμετοχή **κάτω** από τον εθνικό μέσο όρο
(58,3% και 59,8% αντίστοιχα) — όχι επειδή οι κάτοικοί τους ψήφισαν λιγότερο
μαζικά, αλλά επειδή πολλοί παραμένουν εγγεγραμμένοι στον τόπο καταγωγής τους
αντί στη διεύθυνση όπου πραγματικά ζουν, ένα γνωστό χαρακτηριστικό των ελληνικών
εκλογικών καταλόγων. Η γεωγραφία της αποχής εδώ είναι κυρίως γεωγραφία της
πρόσβασης, όχι των μεγάλων πόλεων αυτών καθαυτών.`}
    </div>`
  );

  // ── Closing ──────────────────────────────────────────────────────────────
  body.append(heading_block("Επίλογος", 2));
  body.append(
    markdown_block(
      `Ο πορτοκαλί χάρτης του 2015 λέει αλήθεια — το ΟΧΙ κέρδισε καθαρά, σχεδόν παντού. Αλλά "παντού" δεν
      σημαίνει "εξίσου παντού". Κάτω από την ομοιομορφία της νίκης κρύβεται μια χώρα διαιρεμένη κατά τάξη,
      γεωγραφία, πρόσβαση στην κάλπη, και πολιτική ταυτότητα — μια διαίρεση που ένας χάρτης δύο χρωμάτων απλά δεν
      μπορεί να δείξει.`
    )
  );

  body.append(heading_block("Πηγές & μεθοδολογία", 4));
  body.append(
    markdown_block(
      `Όλα τα δεδομένα προέρχονται από το επίσημο site του Υπουργείου Εσωτερικών (ekloges-prev.singularlogic.eu/r2015).`
    )
  );

  root.replaceChildren(body);
  return root;
}
