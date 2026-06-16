import BareSurface from './BareSurface.jsx';

export default function BareMetric({ label, value, helper, tone = 'neutral' }) {
  return (
    <BareSurface className="btMetric" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </BareSurface>
  );
}
