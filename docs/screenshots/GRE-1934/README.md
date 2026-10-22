# GRE-1934 editor and preview checks

The old Next editor failed while rendering the Services page: its canvas text component called `usePuck` from the older Puck package inside the Puck 0.23 provider. The four `before-editor` images show that runtime error. The replacement uses the Puck 0.23 context inside its own canvas iframe.

| View | Before editor | After editor | After preview |
| --- | --- | --- | --- |
| 1440, dark | [Before](before-editor-dark-1440.png) | [After](after-editor-dark-1440.png) | [Preview](after-preview-dark-1440.png) |
| 390, dark | [Before](before-editor-dark-390.png) | [After](after-editor-dark-390.png) | [Preview](after-preview-dark-390.png) |
| 1440, light | [Before](before-editor-light-1440.png) | [After](after-editor-light-1440.png) | [Preview](after-preview-light-1440.png) |
| 390, light | [Before](before-editor-light-390.png) | [After](after-editor-light-390.png) | [Preview](after-preview-light-390.png) |

The after images came from local Next dev routes on a dedicated `editor.localhost` host, framed by a mock host at `localhost:5182`. The host used the protocol 1 nonce handshake and an in-memory draft from the baked release. In each editor view, a canvas text field accepted `!`, the in-frame Bold button was clickable, and Save draft returned a saved state. Preview clicks emitted a block reference with the site, page, revision, block id, type and engine commit. The preview frame had empty cookies, local and session storage, and IndexedDB; the browser made no external requests and logged no errors. These checks use synthetic local draft revisions and do not write to GSAM.

The build prepares a local copy of the installed Puck 0.23 MIT stylesheet and removes its remote font import. The editor route makes no third-party font request.

The [phone Text toolbar](toolbar-phone.png) shows the brand colour control inside the Puck iframe after applying the approved accent to a selected text run.
