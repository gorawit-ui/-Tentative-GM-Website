// A12 — FU-19: the places and symptoms a repair request is made of, read inside the create transaction
// (before any write): the location must be active, the area (when one is chosen) active and of that
// location, the symptom one of the brief's (D-S08-3: closed places stay for old requests but take no
// new ones). Labels come from the documents, so a renamed place (D-A11-4) names new requests at once.
import { maintenanceSymptom } from '@gm/domain';
import { CommandRejected, type MaintenanceCatalog } from '../commands/execute-command';

export function firestoreMaintenanceCatalog(): MaintenanceCatalog {
  return {
    async resolve(transaction, selection) {
      const location = await transaction.get(`locations/${selection.location_id}`);
      if (location?.active !== true || typeof location.label !== 'string') throw new CommandRejected('LOCATION_UNAVAILABLE', 'No such place, or it is closed');
      let area: { readonly id: string; readonly label: string } | undefined;
      if (selection.area_id !== undefined) {
        const stored = await transaction.get(`areas/${selection.area_id}`);
        if (stored?.active !== true || stored.location_id !== selection.location_id || typeof stored.label !== 'string') {
          throw new CommandRejected('AREA_UNAVAILABLE', 'No such area of this place, or it is closed');
        }
        area = { id: selection.area_id, label: stored.label };
      }
      const symptom = maintenanceSymptom(selection.symptom_key);
      if (symptom === undefined) throw new CommandRejected('SYMPTOM_UNKNOWN', 'Not one of the symptoms of the form');
      return { location: { id: selection.location_id, label: location.label }, ...(area === undefined ? {} : { area }), symptom };
    },
  };
}
