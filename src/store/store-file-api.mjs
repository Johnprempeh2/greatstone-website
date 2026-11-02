// Licence files and PO documents through /api/store-file (GRE-1992). The function checks the signed-in
// person's access to the file index under RLS before it touches the bytes.
const api = (params) => '/api/store-file?' + new URLSearchParams(params);
const failure = async (response, fallback) => new Error((await response.json().catch(() => null))?.error || fallback);

export async function uploadLicenceFile(customerId, file, fetchImpl = fetch) {
  const response = await fetchImpl(api({ bucket: 'licence-files', customer: customerId }), { method: 'POST',
    headers: { 'content-type': 'application/octet-stream',
      'x-file-name': btoa(String.fromCharCode(...new TextEncoder().encode(file.name || 'licence.lic'))) },
    body: file });
  if (!response.ok) throw await failure(response, 'Upload failed. Try again.');
  return (await response.json()).path;
}

export async function removeLicenceFile(path, fetchImpl = fetch) {
  const response = await fetchImpl(api({ bucket: 'licence-files', path }), { method: 'DELETE' });
  if (!response.ok) throw await failure(response, 'Could not remove the file.');
}

export async function downloadStoreFile(bucket, path, name, fetchImpl = fetch) {
  const response = await fetchImpl(api({ bucket, path }));
  if (!response.ok) throw await failure(response, 'The file is unavailable. Try again.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
