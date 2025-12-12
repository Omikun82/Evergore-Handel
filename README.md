# Evergore-Handel
Scripts getestet auf Tampermonkey, Projekte rund um Browsergame Evergore.de
- Bestellhelfer = erstellt blöcke von 50k für den Kauf von HWM </br>
        - neue NULL-Logik lässt alle seiten sauber einlesen und orientiert sich an den maxwerten
        - Mindestbestand im script definieren als sollwert </br>
        - im Lager den Bestand einlesen </br>
        - Beim Fahrenden Händler wird ein Overlay erzeugt was die zu bestellenden Mengen anzeigt und in Bestellblöcken einteilt </br></br>
- Bestellungen - Markt = erstellt blöcke von 50k für den Kauf von HWM </br>
        - Mindestbestand im script definieren </br>
        - in der Angebotsübersicht Daten einlesen </br>
                - es werden alle händler berücksichtig so das man nur auffüllt und nicht in Konkurenz geht   </br>
                - Overlay ist jetzt verschiebbar</br></br>
- Verkaufshelfer = erstellt Blöcke von 50k um die Handelsumsätze zu optimieren </br></br>
- Handelslogger = logt im Hintergrund die Handelserfolge und bietet über einen Downloadbutton 2 gut Auswertbare csv an mit %-Rabatt und %-Häufigkeit </br>
        - Gesamtübersicht = Rabatte werden aufgelistet, als letzte Zeile erfolgt eine statistik </br>
        - Tagesübersicht = Reine statistik auf die tage runtergerechent
          - Multiuser lösung falls sich mehrere Feilscher einen PC teilen
