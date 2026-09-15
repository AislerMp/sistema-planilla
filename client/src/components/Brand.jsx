export default function Brand() {
  return (
    <div className="brand">
      <img
        src="/images/kfc-logo.png"
        alt="KFC"
        className="brand-logo"
        width="56"
        height="56"
      />
      <div>
        <strong>
          Planilla<span className="brand-dot">.</span>
        </strong>
        <small>Gestión de personal</small>
      </div>
    </div>
  );
}
