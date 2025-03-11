Cardmarket scraping project

IF really recent series -> node updateDatabase.js

Put the xlsx file at the root, name it "cartes" and name the the xlsx page "cartes" too
A column for the card Name, B for the card Number, C for the serie code (s12a, BtD...), D for language, C for the card condition (NM, EX, GD)

node getPrices.js


Delete cartes gradées
Récupération de la liste:
-Si état recherché non trouvé :-> Fin
 -Sinon ->
	-Si specifiFilter non trouvé :-> chargement de tous les prix, si toujours nok -> fin
	-Sinon -> supprimer tous les prix ne comportant pas les filtres et "tag" la position de tous les prix voulu dont hasExcludedTerm = false
	    -Si etat recherché non trouvé :-> Fin
	    -Si premier Etat cherché est à 3ème position ou plus ET hasExcludedTerm = false : -> prendre les 3 première cartes
		    -Sinon -> : si prix n°1 est (un prix voulu ET hasExcludedTerm = false) OU (un prix supérieur ET un prix taggé existe plus loin ET hasExcludedTerm = false)
            ->Ajouter le prix à la liste (3 prix max)


