import React, { useEffect, useState } from 'react';
import { staffDb } from './staff-store-api.mjs';

export default function ClientLink({ table, row, onLinked }) {
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (row.customer_id) return;
    let active = true;
    staffDb.from('customers').select('id,name').is('deleted_at', null).order('name').limit(500)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError('Could not load clients. Please try again.');
        else setClients(data || []);
      });
    return () => { active = false; };
  }, [row.customer_id]);

  const link = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    const { data, error: saveError } = await staffDb.from(table).update({ customer_id: selected })
      .eq('id', row.id).is('customer_id', null).select('id');
    setBusy(false);
    if (saveError || !data?.length) {
      setError(saveError?.message || 'This enquiry was already linked. Refresh the list.');
      return;
    }
    onLinked();
  };

  if (row.customer_id) return <p><strong>Linked client:</strong> {row.customer_id}</p>;
  return <div>
    <label htmlFor={'client-link-' + row.id}>Existing client</label>{' '}
    <select id={'client-link-' + row.id} value={selected} onChange={(event) => setSelected(event.target.value)}>
      <option value="">Select a client</option>
      {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
    </select>{' '}
    <button className="gs-btn ghost sm" disabled={!selected || busy} onClick={link}>Link to client</button>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
