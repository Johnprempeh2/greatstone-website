// Lazy entry point for the Puck editor. Importing this module pulls in @measured/puck (~432KB) and
// its stylesheet — both editor-only. App.jsx loads it via React.lazy ONLY when a signed-in admin
// enters edit mode, so neither the JS chunk nor the CSS ever touch a public visitor's first load.
import { Puck } from '@measured/puck';
import '@measured/puck/puck.css';

export default Puck;
