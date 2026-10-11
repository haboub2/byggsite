/**
 * Long-form body copy for the /bygg/tjanster/[slug] pages. Placeholder-quality
 * content the owner should review and personalize — but real, specific,
 * non-repetitive copy rather than lorem ipsum, so the pages are genuinely
 * indexable from day one. Migrates to content/tjanster/*.mdx per PLAN.md
 * §6.2 once that pipeline exists; structured the same way in the meantime
 * (lead + sections + service-specific FAQ) so the move is mechanical.
 */

export type ServiceContent = {
  lead: string;
  sections: { heading: string; body: string }[];
  faq: { q: string; a: string }[];
};

export const servicesContent: Record<string, ServiceContent> = {
  totalrenovering: {
    lead: "En totalrenovering rör hela hemmet på en gång — stomme, planlösning, el, VVS och ytskikt. Vi driver hela projektet, från rivning till slutstädning, med en tidplan och ett fast pris du kan lita på.",
    sections: [
      {
        heading: "Vad ingår i en totalrenovering",
        body: "Vi tar ansvar för hela kedjan: rivning och bortforsling, bärande konstruktioner vid behov, ny el och VVS enligt gällande normer, isolering, golv, väggar, tak och snickerier. Du slipper koordinera flera hantverkare själv — vi samordnar egen personal och de underentreprenörer som krävs, till exempel elektriker och rörmokare, under ett och samma projektansvar.",
      },
      {
        heading: "Så går det till",
        body: "Efter ett kostnadsfritt platsbesök tar vi fram en detaljerad offert med fast pris, tidplan och materialval. Under själva byggtiden får du löpande uppdateringar och tydliga delmål, så att du alltid vet var projektet står. Vid större ingrepp i bärande konstruktion eller planlösning hjälper vi till med bygglovsunderlag där det krävs.",
      },
      {
        heading: "Material och garanti",
        body: "Vi arbetar med material från etablerade svenska leverantörer och följer branschens våtrumsnormer (GVK/Säker Vatten) där det är relevant. Alla totalrenoveringar omfattas av {garanti}, och du är licensierad och försäkrad genom oss under hela byggtiden.",
      },
      {
        heading: "Vad påverkar priset",
        body: "Det som styr kostnaden mest är hur mycket som ska rivas och byggas om, om planlösning eller bärande väggar ändras, och hur mycket el och VVS som behöver dras nytt. Därefter kommer materialvalen: golv, kakel, köksluckor och vitvaror kan skilja flera hundra tusen kronor mellan två i övrigt lika projekt. Vi går igenom alternativen med dig innan offerten skrivs, så att du kan välja var pengarna gör mest nytta. ROT-avdraget dras direkt på fakturan och gäller arbetskostnaden.",
      },
      {
        heading: "Vem gör vad i projektet",
        body: "Rivning, stomme, isolering, golv, väggar, snickerier och montering gör vi med egen personal. El, VVS och våtrumsarbeten utförs av behöriga specialister som vi har arbetat med länge och som följer branschens regelverk. Du har ändå bara ett avtal och en kontaktperson — vi planerar ordningen mellan yrkesgrupperna, kontrollerar varje moment och ansvarar för helheten, inklusive garantin.",
      },
    ],
    faq: [
      { q: "Hur lång tid tar en totalrenovering?", a: "En lägenhet på 60–80 kvm tar oftast 6–10 veckor, ett helt hus 3–6 månader beroende på omfattning. Du får en exakt tidplan i offerten innan vi börjar." },
      { q: "Kan jag bo kvar under renoveringen?", a: "Vid mindre ingrepp går det ofta bra, men vid en fullständig totalrenovering rekommenderar vi tillfälligt boende på annat håll — vi hjälper dig planera vilka delar av hemmet som påverkas när." },
      { q: "Behöver jag bygglov?", a: "Det beror på om planlösning eller bärande konstruktion ändras. Vi bedömer det redan vid platsbesöket och tar fram nödvändigt underlag om det behövs." },
      { q: "Ingår ritningar och design?", a: "Ja, vi hjälper till med planlösning och materialval som en del av offertprocessen, så att du vet exakt hur slutresultatet blir innan arbetet startar." },
    ],
  },

  badrumsrenovering: {
    lead: "Ett badrum som ska hålla i tjugo år kräver rätt tätskikt, rätt fall mot golvbrunn och hantverkare som följer branschreglerna till punkt och pricka. Vi renoverar badrum enligt Säker Vatten och GVK, med fast pris och {garanti}.",
    sections: [
      {
        heading: "Tätskikt och våtrumsnormer",
        body: "Ett badrum som läcker är den dyraste typen av fel ett hem kan ha. Därför följer vi alltid Säker Vatten för VVS-installationer och GVK:s branschregler för tätskikt och kakelsättning. Varje badrum vi renoverar dokumenteras enligt dessa regler, vilket också är en förutsättning för att din hemförsäkring ska gälla fullt ut vid en eventuell vattenskada.",
      },
      {
        heading: "Från riva till klart",
        body: "Vi river ut det gamla badrummet, drar om el och VVS där det behövs, sätter nytt tätskikt, kakel och klinker, och monterar inredning — handfat, blandare, dusch eller badkar, golvvärme och belysning. Du väljer kakel, klinker och inredning i den prisklass som passar, och vi hjälper gärna till med råd om vad som håller bäst i vardagen.",
      },
      {
        heading: "Vanliga badrumsprojekt",
        body: "De flesta uppdrag är antingen en komplett rivning och nybyggnation, eller en delrenovering där stommen är i gott skick men ytskikt och inredning ska bytas. Vi bedömer vilket som är rätt för ditt badrum vid det kostnadsfria besöket, och offererar därefter.",
      },
      {
        heading: "Vad påverkar priset",
        body: "Badrummets storlek och skick är grunden: ett badrum där golvet måste byggas om för rätt fall mot brunnen, eller där gamla rör behöver bytas, tar längre tid än ett där stommen håller. Kakel och klinker i stort format, inbyggda lösningar och golvvärme påverkar också priset, liksom valet mellan dusch och badkar. Du får en specificerad offert där arbete och material står var för sig, så att det är lätt att se vad ROT-avdraget gäller.",
      },
      {
        heading: "Vem gör vad i projektet",
        body: "Rivning, underarbete, tätskikt, kakel och klinker samt montering av inredning gör vi själva. VVS-installationerna utförs av auktoriserade VVS-montörer och elarbetet av behöriga elinstallatörer — det är ett krav enligt reglerna, inte ett val. Vi samordnar dem i rätt ordning, ser till att allt dokumenteras och lämnar över ett badrum med ett samlat ansvar och en garanti från oss.",
      },
    ],
    faq: [
      { q: "Hur lång tid tar en badrumsrenovering?", a: "Ett normalstort badrum (5–8 kvm) tar vanligtvis 3–5 veckor från rivning till klart, inklusive torktider för tätskikt." },
      { q: "Följer ni Säker Vatten och GVK?", a: "Ja, samtliga VVS-installationer görs enligt Säker Vatten och alla tätskikt enligt GVK:s branschregler, med den dokumentation som krävs." },
      { q: "Kan jag använda ROT-avdrag på badrummet?", a: "Ja, arbetskostnaden för badrumsrenovering är ROT-berättigad. Vi hjälper dig med uppgifterna och drar av direkt på fakturan." },
      { q: "Vad kostar en badrumsrenovering?", a: "Priset beror på badrummets storlek, planlösning och vald inredning. Du får en specificerad offert med fast pris efter det kostnadsfria besöket — inga dolda kostnader." },
    ],
  },

  koksrenovering: {
    lead: "Köket är hemmets mest använda rum, och ofta det som påverkar bostadens värde mest. Vi renoverar kök från grunden — snickerier, bänkskivor, vitvaror, el och belysning — med en design som funkar i vardagen.",
    sections: [
      {
        heading: "Design och planlösning",
        body: "Vi utgår från hur köket faktiskt används: arbetsflöde mellan diskbänk, spis och kylskåp, förvaring där du behöver den, och tillräckligt med bänkyta. Oavsett om det är ett litet köksrenoveringsprojekt eller en helt ny planlösning med köksö, hjälper vi dig från idé till färdig ritning.",
      },
      {
        heading: "Snickerier, bänkskivor och vitvaror",
        body: "Vi monterar köksluckor och stommar från de flesta större leverantörer, skär och monterar bänkskivor i laminat, sten eller trä, och kopplar in vitvaror korrekt enligt gällande el- och VVS-normer. Belysning — både funktionell arbetsbelysning och stämningsljus — planeras in tidigt, inte som en eftertanke.",
      },
      {
        heading: "El och VVS i köket",
        body: "Nya kök kräver ofta fler eluttag, ny köksfläkt med korrekt ventilation, och omdragning av vatten och avlopp om diskbänken flyttas. Behöriga elinstallatörer och auktoriserade VVS-montörer som vi har arbetat med länge gör det arbetet som en del av samma projekt, med ett samlat ansvar och en tidplan.",
      },
      {
        heading: "Vad påverkar priset",
        body: "Störst skillnad gör om köket behåller sin planlösning eller flyttas: när diskbänk, spis eller köksö byter plats behöver vatten, avlopp, el och ventilation dras om. Därefter avgör valet av luckor, bänkskivor och vitvaror. En bänkskiva i sten kostar mer än laminat men håller i decennier. Vi tar fram ett förslag i två prisnivåer om du vill, så att du ser vad varje val betyder för helheten.",
      },
      {
        heading: "Vem gör vad i projektet",
        body: "Rivning, väggar, golv, montering av stommar, luckor och bänkskivor och alla snickerier gör vi med egen personal. Ny el, flyttade eluttag och anslutning av vitvaror utförs av behöriga elinstallatörer, och flyttade vatten- och avloppsledningar av auktoriserade VVS-montörer. Allt ingår i samma offert och samma tidplan, med oss som ansvarig hela vägen.",
      },
    ],
    faq: [
      { q: "Kan ni montera kök jag redan köpt?", a: "Ja, vi monterar kök från de flesta leverantörer, oavsett om du köpt det själv eller vill ha hjälp med hela processen inklusive inköp." },
      { q: "Hur länge är köket ur funktion?", a: "En normal köksrenovering tar 2–4 veckor. Vi planerar arbetet så att du har tillgång till kök och vatten så stor del av tiden som möjligt." },
      { q: "Ingår flytt av vatten och avlopp?", a: "Ja, om planlösningen kräver att diskbänk eller vitvaror flyttas drar vi om VVS enligt Säker Vatten som en del av offerten." },
      { q: "Vad kostar en köksrenovering?", a: "Priset styrs av köksstorlek, materialval och om planlösningen ändras. Du får en specificerad offert med fast pris efter platsbesöket." },
    ],
  },

  tillbyggnad: {
    lead: "En tillbyggnad ger dig mer yta utan att flytta — extra sovrum, större vardagsrum eller en inredd vind. Vi sköter allt från bygglov till nyckelfärdigt resultat, med samma garanti och projektledning som våra övriga renoveringar.",
    sections: [
      {
        heading: "Från idé till bygglov",
        body: "De flesta tillbyggnader kräver bygglov eller anmälan till kommunen. Vi hjälper till att ta fram det underlag som krävs — ritningar, situationsplan och konstruktionsberäkningar där det behövs — och driver bygglovsprocessen tillsammans med dig.",
      },
      {
        heading: "Grund till tak",
        body: "Vi bygger grund eller platta, stomme, tak, fasad, fönster och dörrar, samt drar in el, VVS och ventilation kopplat till det befintliga huset. Övergången mellan gammal och ny del — isolering, fuktspärr och anslutningar — är det som avgör om tillbyggnaden håller lika länge som resten av huset, och det är där vår erfarenhet gör störst skillnad.",
      },
      {
        heading: "Inredda vindar och öppna planlösningar",
        body: "Utöver traditionella tillbyggnader inreder vi även vindsutrymmen och river väggar för öppnare planlösningar, med de förstärkningar av bärande konstruktion som krävs. Vi bedömer alltid bärighet innan vi offererar, så att du vet vad som är möjligt innan projektet startar.",
      },
      {
        heading: "Vad påverkar priset",
        body: "Ytan är en del, men grundläggningen, takets konstruktion och hur tillbyggnaden ansluter till det befintliga huset väger ofta tyngre. Stora glaspartier, takkupor och våtrum i tillbyggnaden höjer kostnaden, medan en enkel och rak konstruktion håller den nere. Bygglovsavgiften tas ut av kommunen och ligger utanför vår offert, men vi tar fram underlaget och hjälper dig genom ansökan.",
      },
      {
        heading: "Vem gör vad i projektet",
        body: "Stomme, tak, isolering, fönster, invändiga ytskikt och snickerier gör vi själva. Mark- och grundarbeten, el och VVS utförs av specialister som vi samordnar och kontrollerar. Konstruktionsberäkningar tas fram av en konstruktör när det behövs. Du har en kontaktperson genom hela projektet — från ritning och bygglov till slutbesiktning.",
      },
    ],
    faq: [
      { q: "Behöver jag bygglov för en tillbyggnad?", a: "I de flesta fall ja, men mindre tillbyggnader kan omfattas av attefallsreglerna och kräva enbart en anmälan. Vi hjälper till att reda ut vad som gäller för just ditt hus." },
      { q: "Hur lång tid tar en tillbyggnad?", a: "Från bygglov till inflyttningsklart tar en normalstor tillbyggnad (20–30 kvm) vanligtvis 3–5 månader, inklusive handläggningstid hos kommunen." },
      { q: "Kan ni bygga på en befintlig grund eller altan?", a: "Det beror på grundens skick och dimensionering. Vi besiktigar alltid den befintliga konstruktionen innan vi bedömer om den kan återanvändas." },
      { q: "Ingår el och VVS i tillbyggnaden?", a: "Ja, vi kopplar in tillbyggnaden mot husets befintliga el- och VVS-system som en del av projektet, utfört av behöriga elinstallatörer och auktoriserade VVS-montörer som vi samordnar." },
    ],
  },

  tak: {
    lead: "Ett tak som läcker skadar hela huset, inte bara vinden. Vi lägger nya tak, byter enskilda takpannor och plåtdetaljer, och tätar mot läckage — arbete som håller din fastighet skyddad året runt.",
    sections: [
      {
        heading: "Nya tak och omläggning",
        body: "Vid en total omläggning river vi det gamla taktäcket, kontrollerar råspont och underlagstak, och lägger nytt taktäcke i tegel, betongpannor eller plåt beroende på husets stil och önskemål. Vi ser samtidigt över takavvattning, vindskivor och genomföringar, som ofta är källan till framtida läckage om de inte görs rätt från början.",
      },
      {
        heading: "Reparationer och tätning",
        body: "Mindre skador — trasiga pannor, otäta skorstensanslutningar, sprickor i plåt — åtgärdar vi utan att hela taket behöver läggas om. Ett akut läckage prioriterar vi snabbt, eftersom fukt som får ligga länge kan leda till mögel och rötskador i takstolar och isolering.",
      },
      {
        heading: "Säkerhet och årstidsanpassning",
        body: "Allt takarbete görs med fallskydd och rätt utrustning enligt Arbetsmiljöverkets krav. Vi planerar större takarbeten efter väder och årstid för att minimera risken för fuktskador under själva arbetet, och skyddar alltid öppna ytor vid oväntat väderomslag.",
      },
      {
        heading: "Vad påverkar priset",
        body: "Takets yta och lutning, materialet och hur mycket av underlaget som behöver bytas avgör priset. Ett tak där råspont och läkt är friska går snabbare att lägga om än ett där fukt har kommit in. Ställning, bortforsling och plåtdetaljer runt skorsten och takfönster ingår alltid i vår offert, så att det inte tillkommer något efteråt. ROT-avdraget gäller arbetskostnaden även för takarbeten.",
      },
      {
        heading: "Vem gör vad i projektet",
        body: "Rivning, underlag, läkt, takpannor och de flesta tätningsarbeten gör vi med egen personal. Plåtarbeten och vissa specialtak, till exempel plåttak eller papptak på låglutande tak, kan utföras av en specialiserad partner som vi har arbetat med länge. Oavsett vem som lägger varje del ansvarar vi för hela taket och garantin.",
      },
    ],
    faq: [
      { q: "Hur vet jag om taket behöver läggas om eller bara repareras?", a: "Vi gör en kostnadsfri takbesiktning och bedömer skicket på taktäcke, underlagstak och råspont innan vi rekommenderar reparation eller omläggning." },
      { q: "Hur lång tid tar en takomläggning?", a: "Ett normalstort villatak tar vanligtvis 1–2 veckor beroende på takyta, taktäckningsmaterial och väder." },
      { q: "Arbetar ni med akuta läckage?", a: "Ja, akuta läckage prioriterar vi och kan oftast göra en tillfällig tätning inom kort, följt av en permanent lösning." },
      { q: "Vilka taktäckningsmaterial jobbar ni med?", a: "Vi lägger tegel- och betongpannor, plåttak samt papptak, och hjälper dig välja material utifrån hustyp, budget och underhållsbehov." },
    ],
  },

  golv: {
    lead: "Ett golv ska tåla vardagen och se bra ut i tio till tjugo år. Vi lägger trä, laminat, klinker och vinyl med rätt underarbete — avjämning, fuktspärr och fall där det behövs — för en finish som håller.",
    sections: [
      {
        heading: "Rätt golv för rätt rum",
        body: "Trägolv och laminat passar sovrum och vardagsrum, medan klinker och kakel är rätt val i våtutrymmen och hallar med mycket slitage. Vinylgolv är ett prisvärt och tåligt alternativ som fungerar i de flesta rum. Vi hjälper dig välja rätt material utifrån rum, budget och hur golvet kommer användas.",
      },
      {
        heading: "Avjämning och underarbete",
        body: "Ett ojämnt undergolv är den vanligaste orsaken till att golv knakar, spricker eller får synliga fogar över tid. Vi avjämnar betong- och träundergolv innan läggning, och lägger fuktspärr där det behövs — särskilt viktigt i källare och våtutrymmen.",
      },
      {
        heading: "Golvvärme och fall mot golvbrunn",
        body: "Vid renovering av badrum och våtutrymmen installerar vi golvvärme och ser till att golvet har rätt fall mot golvbrunn enligt GVK:s branschregler. I övriga rum kan golvvärme läggas in vid renovering för ett behagligare inomhusklimat.",
      },
      {
        heading: "Vad påverkar priset",
        body: "Golvets yta och vilket material du väljer är grunden, men underarbetet gör ofta störst skillnad: ett ojämnt undergolv behöver avjämnas, och på betong krävs fuktspärr. Golvvärme, trösklar och lister ingår i en komplett offert. Massivt trä och stora klinkerplattor tar längre tid att lägga än laminat och vinyl, och det syns i priset — men också i hur länge golvet håller.",
      },
      {
        heading: "Vem gör vad i projektet",
        body: "Rivning, avjämning, fuktspärr och läggning av alla golvtyper gör vi själva. Elektrisk golvvärme kopplas in av en behörig elinstallatör, och vattenburen golvvärme av en auktoriserad VVS-montör. Du har en kontakt och ett avtal, och vi ser till att golvet läggs först när underlaget är torrt och klart.",
      },
    ],
    faq: [
      { q: "Vilket golv håller bäst i hallen?", a: "Klinker eller ett tåligt vinylgolv rekommenderas ofta för hallar med mycket slitage och fukt utifrån, men vi utgår alltid från dina önskemål och budget." },
      { q: "Kan ni lägga golv ovanpå befintligt golv?", a: "Ibland, om undergolvet är jämnt och i gott skick. Vi bedömer det vid platsbesöket — annars rivs det gamla golvet ut innan nytt läggs." },
      { q: "Hur lång tid tar en golvläggning?", a: "Ett normalstort rum tar 1–3 dagar beroende på material och om avjämning krävs, medan hela bostäder tar en till två veckor." },
      { q: "Installerar ni golvvärme?", a: "Ja, vi installerar vattenburen och elektrisk golvvärme både i våtutrymmen och i övriga rum vid renovering." },
    ],
  },

  maleri: {
    lead: "Skarpa kanter, jämna ytor och färg som håller flera år utan att flagna eller missfärgas — det är skillnaden mellan ett hantverksmässigt målningsarbete och ett hastigt. Vi målar och putsar inom- och utomhus med förstklassiga material.",
    sections: [
      {
        heading: "Målning inomhus",
        body: "Innan färgen läggs på förbereder vi ytan ordentligt: spackling, slipning och grundning där det behövs. Vi målar väggar, tak, snickerier och foder, och lägger extra omsorg vid kanter och hörn där de flesta målningsjobb annars syns tydligast att de gjorts snabbt.",
      },
      {
        heading: "Putsning och fasadmålning",
        body: "Utomhus putsar och målar vi fasader med material anpassade för svenskt klimat — fukt, frost och sol som annars sliter hårt på ytskikten. Vi lagar putsskador innan målning och väljer produkter med rätt diffusionsförmåga för husets konstruktion, särskilt viktigt på äldre putsfasader.",
      },
      {
        heading: "Materialval",
        body: "Vi arbetar med förstklassiga färgsystem från etablerade tillverkare och rekommenderar produkter utifrån underlag och önskad livslängd, snarare än det billigaste alternativet i stunden — det är det som gör att resultatet håller.",
      },
      {
        heading: "Vad påverkar priset",
        body: "Underarbetet avgör både priset och resultatet. Väggar med sprickor, gamla tapeter eller flagnande färg behöver spacklas, slipas och ibland grundas innan de målas. På fasader styr husets höjd, behovet av ställning och träets skick. Vi lägger hellre tid på underarbetet än att måla två gånger, och det framgår tydligt i offerten vad som ingår.",
      },
      {
        heading: "Vem gör vad i projektet",
        body: "Invändig målning, spackling och tapetsering gör vi med egen personal. Större fasad- och putsarbeten kan utföras tillsammans med en målerifirma som vi har arbetat med länge, när det krävs fler händer eller särskild utrustning. Du har ändå bara oss att hålla kontakten med, och vi ansvarar för resultatet.",
      },
    ],
    faq: [
      { q: "Hur ofta behöver en fasad målas om?", a: "Beroende på material och väderexponering håller en fasadmålning normalt 8–15 år. Vi bedömer skicket vid besiktning och rekommenderar rätt tidpunkt." },
      { q: "Målar ni både invändigt och utvändigt?", a: "Ja, vi utför både inomhusmålning och utomhus fasadmålning samt putsarbeten." },
      { q: "Behöver jag flytta möbler innan ni målar?", a: "Vi hjälper gärna till att skydda golv och möbler, men uppskattar om du kan flytta undan det mest ömtåliga i förväg." },
      { q: "Hur lång tid tar en ommålning av ett rum?", a: "Ett normalstort rum tar 1–2 dagar inklusive förberedelse, beroende på underlagets skick och antal strykningar." },
    ],
  },

  "el-vvs": {
    lead: "El och VVS är den del av hemmet du märker minst när det fungerar — och mest när det inte gör det. Behöriga elinstallatörer och auktoriserade VVS-montörer gör säkra installationer och uppgraderingar enligt gällande normer.",
    sections: [
      {
        heading: "Elinstallationer",
        body: "Vi drar ny el, byter säkringsskåp, installerar jordfelsbrytare och sätter upp belysning och eluttag — allt utfört av behöriga elinstallatörer enligt Elsäkerhetsverkets föreskrifter. Vanliga uppdrag är omdragning vid renovering, uppgradering av äldre elcentraler, och installation av laddbox för elbil.",
      },
      {
        heading: "VVS-installationer",
        body: "VVS-montörerna vi samarbetar med gör allt från byte av blandare och toaletter till komplett omdragning av vatten och avlopp vid en renovering, samt installation av golvvärme och bergvärme. Allt VVS-arbete i våtutrymmen görs enligt Säker Vatten, vilket är en förutsättning för att din försäkring ska gälla fullt ut.",
      },
      {
        heading: "Kombinerat vid renovering",
        body: "Vid en badrums-, köks- eller totalrenovering samordnar vi el och VVS som en del av samma projekt, med ett samlat ansvar istället för att du själv behöver anlita och koordinera separata hantverkare.",
      },
      {
        heading: "Vad påverkar priset",
        body: "Omfattningen styr: ett byte av blandare eller en ny laddbox är ett kort uppdrag, medan ny el i hela huset eller omdragning av vatten och avlopp vid en renovering tar betydligt längre tid. Husets ålder spelar in, eftersom äldre installationer ofta behöver uppgraderas för att klara dagens krav. Du får ett fast pris efter att vi har sett installationen, och akuta ärenden prioriteras.",
      },
      {
        heading: "Vem gör vad i projektet",
        body: "El- och VVS-arbeten är reglerade yrken. Elarbetet utförs av behöriga elinstallatörer och VVS-arbetet av auktoriserade montörer enligt Säker Vatten — partners som vi har arbetat med länge. Vi beställer, samordnar och kontrollerar arbetet, och du får ett avtal, en faktura och en garanti från oss. Behöver väggar, golv eller tak öppnas och återställas gör vi det själva.",
      },
    ],
    faq: [
      { q: "Är elektrikerna och rörmokarna behöriga?", a: "Ja. Alla el- och VVS-installationer utförs av behöriga elinstallatörer respektive auktoriserade VVS-montörer enligt Elsäkerhetsverkets och Säker Vattens regelverk. Vi samordnar dem och ansvarar för helheten gentemot dig." },
      { q: "Kan ni installera laddbox för elbil?", a: "Ja, vi installerar laddboxar med rätt säkring och jordfelsbrytare enligt gällande föreskrifter." },
      { q: "Gör ni akuta VVS-jobb, som vattenläckor?", a: "Vi prioriterar akuta ärenden som vattenläckor och strömavbrott och rycker ut så snart vi kan." },
      { q: "Kan ni göra bara el eller bara VVS, inte båda?", a: "Absolut, du kan anlita oss för endera delen eller båda tillsammans — vad som passar ditt projekt." },
    ],
  },

  projektledning: {
    lead: "Ett större byggprojekt involverar många yrkesgrupper, leveranser och beslut. Med oss som projektledare får du en kontaktperson som samordnar allt — så att du slipper vara din egen byggledare.",
    sections: [
      {
        heading: "En kontaktperson, hela vägen",
        body: "Istället för att själv boka och koordinera snickare, elektriker, rörmokare och materialleveranser, har du en projektledare hos oss som sköter det åt dig. Du får löpande avstämningar och behöver bara ta ställning till de beslut som faktiskt kräver ditt godkännande.",
      },
      {
        heading: "Tidplan och budget",
        body: "Vi tar fram en realistisk tidplan innan projektet startar och håller den uppdaterad löpande. Budgetuppföljning sker transparent — du ser vad som är förbrukat och vad som återstår, utan överraskningar i slutfakturan.",
      },
      {
        heading: "Passar för",
        body: "Projektledning är särskilt värdefullt vid större renoveringar eller nybyggnation där flera yrkesgrupper är inblandade samtidigt, eller om du inte har möjlighet att själv vara på plats regelbundet under byggtiden.",
      },
      {
        heading: "Vad påverkar priset",
        body: "Projektledning prissätts efter projektets storlek och hur mycket samordning som krävs: hur många yrkesgrupper som är inblandade, hur lång byggtiden är och om vi även tar hand om upphandling, bygglov och besiktningar. Du får ett fast arvode eller ett tak för kostnaden, aldrig en öppen räkning, och kan välja om vi även utför delar av arbetet själva.",
      },
      {
        heading: "Vem gör vad i projektet",
        body: "Vi är din enda kontakt och företräder dig gentemot alla som arbetar i projektet. Vi upphandlar och kvalitetssäkrar de underentreprenörer som behövs, skriver avtal med tydliga krav, följer upp tidplan och budget varje vecka och kontrollerar varje moment innan nästa tar vid. Mycket av arbetet kan vi dessutom utföra med egen personal, vilket ger kortare beslutsvägar.",
      },
    ],
    faq: [
      { q: "Kan jag anlita bara projektledning, utan att ni utför själva arbetet?", a: "I de flesta fall kombinerar vi projektledning med att vi själva utför eller samordnar arbetet, men hör av dig så pratar vi igenom vad som passar ditt projekt." },
      { q: "Hur ofta får jag uppdateringar?", a: "Du får löpande avstämningar under hela projektet, med tydliga delmål så att du alltid vet var arbetet står." },
      { q: "Vad kostar projektledning?", a: "Det beror på projektets omfattning och antal inblandade yrkesgrupper. Du får en specificerad offert efter det kostnadsfria platsbesöket." },
      { q: "Hjälper ni till med upphandling av underentreprenörer?", a: "Ja, vi upphandlar och kvalitetssäkrar de underentreprenörer som krävs, och tar ansvar för helheten gentemot dig som kund." },
    ],
  },
};

/** Page furniture for each Bygg service: the short line in the register,
 *  three facts under the hero (the warranty is the fourth, from the content
 *  store), and the "Det här ingår" checklist.
 *  Durations mirror the FAQ answers above. Review before launch. */
export type ServiceExtras = {
  meta: string;
  facts: { value: string; label: string }[];
  included: string[];
};

export const serviceExtras: Record<string, ServiceExtras> = {
  totalrenovering: {
    meta: "Hus, lägenhet, hela kedjan",
    facts: [
      { value: "6–10 v", label: "lägenhet 60–80 m²" },
      { value: "3–6 mån", label: "helt hus" },
      { value: "Fast pris", label: "efter platsbesök" },
    ],
    included: [
      "Rivning och bortforsling",
      "Bärande konstruktion vid behov",
      "El och VVS enligt gällande normer",
      "Isolering, golv, väggar och tak",
      "Snickerier och montering",
      "Slutbesiktning och städning",
    ],
  },
  badrumsrenovering: {
    meta: "Tätskikt, kakel, VVS",
    facts: [
      { value: "3–5 v", label: "badrum 5–8 m²" },
      { value: "GVK", label: "och Säker Vatten" },
      { value: "ROT", label: "avdrag på arbetet" },
    ],
    included: [
      "Rivning av befintligt badrum",
      "Tätskikt enligt GVK",
      "VVS enligt Säker Vatten",
      "Kakel och klinker",
      "Golvvärme och belysning",
      "Montering av inredning",
    ],
  },
  koksrenovering: {
    meta: "Snickerier, bänkskivor, vitvaror",
    facts: [
      { value: "2–4 v", label: "typisk byggtid" },
      { value: "ROT", label: "avdrag på arbetet" },
      { value: "Fast pris", label: "efter platsbesök" },
    ],
    included: [
      "Planlösning och ritning",
      "Montering av stommar och luckor",
      "Bänkskivor i laminat, sten eller trä",
      "Inkoppling av vitvaror",
      "Omdragning av el och VVS",
      "Arbets- och stämningsbelysning",
    ],
  },
  tillbyggnad: {
    meta: "Tillbyggnad, vind, planlösning",
    facts: [
      { value: "3–5 mån", label: "20–30 m², inkl. bygglov" },
      { value: "Bygglov", label: "vi tar fram underlaget" },
      { value: "Grund", label: "till tak" },
    ],
    included: [
      "Ritningar och bygglovsunderlag",
      "Grund eller platta",
      "Stomme, tak och fasad",
      "Fönster och dörrar",
      "El, VVS och ventilation",
      "Anslutning mot befintligt hus",
    ],
  },
  tak: {
    meta: "Omläggning, reparation, tätning",
    facts: [
      { value: "1–2 v", label: "normalstort villatak" },
      { value: "Gratis", label: "takbesiktning" },
      { value: "Akut", label: "läckage prioriteras" },
    ],
    included: [
      "Besiktning av taktäcke och underlagstak",
      "Rivning och bortforsling",
      "Nytt underlagstak vid behov",
      "Tegel, betong, plåt eller papp",
      "Plåtdetaljer och genomföringar",
      "Takavvattning",
    ],
  },
  golv: {
    meta: "Trä, laminat, klinker, vinyl",
    facts: [
      { value: "1–3 dagar", label: "per rum" },
      { value: "Avjämning", label: "ingår vid behov" },
      { value: "ROT", label: "avdrag på arbetet" },
    ],
    included: [
      "Rivning av befintligt golv",
      "Avjämning av undergolv",
      "Fuktspärr där det behövs",
      "Trä, laminat, klinker eller vinyl",
      "Golvvärme",
      "Lister och avslutning",
    ],
  },
  maleri: {
    meta: "Inomhus, fasad, puts",
    facts: [
      { value: "1–2 dagar", label: "per rum" },
      { value: "8–15 år", label: "hållbarhet på fasad" },
      { value: "ROT", label: "avdrag på arbetet" },
    ],
    included: [
      "Skydd av golv och möbler",
      "Spackling och slipning",
      "Grundning",
      "Väggar, tak och snickerier",
      "Putslagning",
      "Fasadmålning",
    ],
  },
  "el-vvs": {
    meta: "Installation och uppgradering",
    facts: [
      { value: "Certifierat", label: "el och VVS" },
      { value: "Säker Vatten", label: "i våtrum" },
      { value: "Akut", label: "ärenden prioriteras" },
    ],
    included: [
      "Ny el och omdragning",
      "Byte av elcentral",
      "Jordfelsbrytare",
      "Laddbox för elbil",
      "Vatten och avlopp",
      "Golvvärme och bergvärme",
    ],
  },
  projektledning: {
    meta: "En kontaktperson, hela vägen",
    facts: [
      { value: "1", label: "kontaktperson" },
      { value: "Löpande", label: "avstämningar" },
      { value: "Öppen", label: "budgetuppföljning" },
    ],
    included: [
      "Tidplan före start",
      "Samordning av yrkesgrupper",
      "Upphandling av underentreprenörer",
      "Materialbeställningar",
      "Löpande budgetuppföljning",
      "Slutbesiktning",
    ],
  },
};

/** Search titles and descriptions: the phrase people actually search for,
 *  and the reasons to click (no town: we work across several regions). Descriptions stay under ~155 chars. */
export const serviceSeo: Record<string, { title: string; description: string }> = {
  totalrenovering: {
    title: "Totalrenovering med fast pris och ROT-avdrag",
    description: "Totalrenovering av hus och lägenhet — rivning, el, VVS, ytskikt och snickerier. Ett team, fast pris, ROT-avdrag och {garanti}.",
  },
  badrumsrenovering: {
    title: "Badrumsrenovering med tätskikt enligt branschregler",
    description: "Badrumsrenovering med tätskikt enligt branschregler, kakel, golvvärme och VVS. Fast pris, ROT på fakturan och {garanti}.",
  },
  koksrenovering: {
    title: "Köksrenovering — planering, montage och installation",
    description: "Köksrenovering — planlösning, montage av alla större köksmärken, bänkskivor, el och VVS. Fast pris och ROT-avdrag direkt på fakturan.",
  },
  tillbyggnad: {
    title: "Tillbyggnad och inredd vind, nyckelfärdigt",
    description: "Tillbyggnad, inredd vind eller ny planlösning. Vi tar fram bygglovsunderlag och bygger nyckelfärdigt, från grund till tak.",
  },
  tak: {
    title: "Takbyte och takarbeten",
    description: "Takomläggning, reparation och tätning. Tegel, betong, plåt eller papp. Kostnadsfri takbesiktning, akuta läckage prioriteras.",
  },
  golv: {
    title: "Golvläggning — trä, klinker, laminat och vinyl",
    description: "Golvläggning — trä, laminat, klinker och vinyl med avjämning, fuktspärr och golvvärme. Fast pris och ROT-avdrag på arbetet.",
  },
  maleri: {
    title: "Målare — måleri, fasad och puts",
    description: "Målning inomhus, fasadmålning och putsarbeten. Ordentligt underarbete och förstklassiga färgsystem. ROT-avdrag på arbetet.",
  },
  "el-vvs": {
    title: "Elektriker och rörmokare — el och VVS",
    description: "El och VVS — ny el, elcentral, laddbox, vatten och avlopp, golvvärme. Certifierade installatörer, akuta ärenden prioriteras.",
  },
  projektledning: {
    title: "Projektledning för bygg",
    description: "Byggprojektledning: en kontaktperson som samordnar yrkesgrupper, tidplan och budget, med öppen uppföljning hela vägen.",
  },
};
