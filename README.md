Cardmarket scraping project

getAllSeries :
Récup : nom Série (mélange anglais/fr) + url Série + url liste cartes + date série + nbr cartes
-Si fichier Json déjà créé, le modifier
-Mettre à jour les infos des 2 dernier mois

getAllSeriesData :
Récup : langues, bloc
-Si clés "langues" et/ou "bloc" vides ou inexistantes -> retry 3 fois max l'url
-Si toutes les clés langues ok, mettre à jour 2 derniers mois

getCardsinfo :
Récup infos cartes : url, nom, eng nom, numéro, rareté, nom série, productRow (id cardmarket de la carte)
Si nombre de pages inférieur ou égal à 15 -> récup normal des infos
Si nbr de pages = 15+ (supérieur à 15) -> récup data sur première url + url inverse (tri décroissant / croissant, alphabétique, etc) et stop lorsque la dernière carte de la première url est trouvé avec la 2ème url
Si pas de nbr de page + pas de div "productRow" -> passer à l'url suivante
Si productRow non récup alors qu'il reste des pages, recharger la page

SIUUUU