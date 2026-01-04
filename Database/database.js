const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const dbPath = path.join(__dirname, 'data.json');

class Database {
    constructor() {
        this.ensureFileExists();
        this.data = this.loadDataSync();
        this.saveTimeout = null;
        this.isDirty = false;
        this.isSaving = false;
        this.lastSaveTime = Date.now();
    }

    /**
     * Assure que le fichier JSON existe
     */
    ensureFileExists() {
        try {
            if (!fsSync.existsSync(dbPath)) {
                fsSync.writeFileSync(dbPath, JSON.stringify([], null, 2), 'utf8');
                console.log('✅ Fichier data.json créé');
            }
        } catch (error) {
            console.error('❌ Erreur lors de la création du fichier:', error);
            throw error;
        }
    }

    /**
     * Charge les données de manière synchrone (au démarrage uniquement)
     */
    loadDataSync() {
        try {
            const data = fsSync.readFileSync(dbPath, 'utf8');
            const parsed = JSON.parse(data);
            console.log(`📂 ${parsed.length} entrées chargées depuis data.json`);
            return parsed;
        } catch (error) {
            console.error('❌ Erreur lors de la lecture du fichier:', error);
            return [];
        }
    }

    /**
     * Retourne les données en mémoire
     */
    getData() {
        return this.data;
    }

    /**
     * Sauvegarde immédiate et synchrone
     * @param {Array} newData - Nouvelles données à sauvegarder
     */
    async saveData(newData) {
        if (this.isSaving) {
            console.log('⏳ Sauvegarde déjà en cours, attente...');
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.saveData(newData);
        }

        this.isSaving = true;
        try {
            await fs.writeFile(dbPath, JSON.stringify(newData, null, 2), 'utf8');
            this.data = newData;
            this.isDirty = false;
            this.lastSaveTime = Date.now();
            console.log('💾 Données sauvegardées');
        } catch (error) {
            console.error('❌ Erreur lors de la sauvegarde:', error);
            throw error;
        } finally {
            this.isSaving = false;
        }
    }

    /**
     * Sauvegarde différée (debounced) pour optimiser les I/O
     * Utile quand on fait plusieurs modifications rapprochées
     * @param {Array} newData - Nouvelles données
     * @param {number} delay - Délai avant sauvegarde (ms)
     */
    saveDataDeferred(newData, delay = 5000) {
        // Mettre à jour les données en mémoire immédiatement
        this.data = newData;
        this.isDirty = true;

        // Annuler le timeout précédent si existant
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        // Programmer une nouvelle sauvegarde
        this.saveTimeout = setTimeout(async () => {
            if (this.isDirty) {
                try {
                    await this.saveData(this.data);
                    console.log('💾 Sauvegarde différée effectuée');
                } catch (error) {
                    console.error('❌ Erreur lors de la sauvegarde différée:', error);
                }
            }
        }, delay);
    }

    /**
     * Force la sauvegarde immédiate si des changements sont en attente
     * À appeler avant de fermer l'application
     */
    async flush() {
        // Annuler le timeout en cours
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }

        // Sauvegarder si des modifications sont en attente
        if (this.isDirty && !this.isSaving) {
            console.log('💾 Flush des données en attente...');
            await this.saveData(this.data);
        }
    }

    /**
     * Crée une sauvegarde du fichier JSON
     * @param {string} suffix - Suffixe pour le nom du backup
     */
    async backup(suffix = null) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const backupName = suffix 
                ? `data_backup_${suffix}_${timestamp}.json`
                : `data_backup_${timestamp}.json`;
            
            const backupPath = path.join(__dirname, backupName);
            await fs.copyFile(dbPath, backupPath);
            console.log(`💾 Backup créé: ${backupName}`);
            return backupPath;
        } catch (error) {
            console.error('❌ Erreur lors de la création du backup:', error);
            throw error;
        }
    }

    /**
     * Retourne des statistiques sur la base de données
     */
    getStats() {
        const totalEntries = this.data.length;
        const totalCards = this.data.reduce((sum, entry) => {
            return sum + (entry.cards?.length || 0);
        }, 0);
        
        const timeSinceLastSave = Date.now() - this.lastSaveTime;

        return {
            totalEntries,
            totalCards,
            isDirty: this.isDirty,
            isSaving: this.isSaving,
            lastSaveTime: new Date(this.lastSaveTime).toLocaleString('fr-FR'),
            timeSinceLastSave: `${Math.round(timeSinceLastSave / 1000)}s`,
            hasPendingSave: this.saveTimeout !== null,
        };
    }

    /**
     * Réinitialise la base de données (ATTENTION: destructif)
     */
    async reset() {
        console.log('⚠️  Réinitialisation de la base de données...');
        this.data = [];
        await this.saveData([]);
        console.log('✅ Base de données réinitialisée');
    }
}

// Export d'une instance unique (Singleton)
module.exports = new Database();