import SpreadsheetApp from './spreadsheets/SpreadsheetApp.jsx';

export default function WorkspaceSheets({ requestConfirm }) {
  return <SpreadsheetApp requestConfirm={requestConfirm} />;
}
