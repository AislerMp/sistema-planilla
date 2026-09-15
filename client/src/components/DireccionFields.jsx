import { useEffect, useState } from "react";
import {
  getProvincias,
  getCantones,
  getDistritos,
  getDistrito,
  getCanton,
} from "../services/ubicaciones.Service.js";

export default function DireccionFields({
  form,
  setForm,
  initialDistritoId = null,
}) {
  const [provincias, setProvincias] = useState([]);
  const [cantones, setCantones] = useState([]);
  const [distritos, setDistritos] = useState([]);
  const [provincia, setProvincia] = useState("");
  const [canton, setCanton] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const provinces = await getProvincias();
        if (!mounted) return;
        setProvincias(provinces);
        if (initialDistritoId) {
          const district = await getDistrito(initialDistritoId);
          const parent = await getCanton(district.CantonId);
          if (!mounted) return;
          setProvincia(String(parent.ProvinciaId));
          setCanton(String(parent.CantonId));
        }
      } catch (error) {
        if (mounted) setError(error.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    
    load();
    return () => {
      mounted = false;
    };
  }, [initialDistritoId]);

  useEffect(() => {
    let mounted = true;
    if (provincia)
      getCantones(provincia)
        .then((data) => {
          if (mounted) setCantones(data);
        })
        .catch((error) => {
          if (mounted) setError(error.message);
        });
    return () => {
      mounted = false;
    };
  }, [provincia]);

  useEffect(() => {
    let mounted = true;
    if (canton)
      getDistritos(canton)
        .then((data) => {
          if (mounted) setDistritos(data);
        })
        .catch((error) => {
          if (mounted) setError(error.message);
        });
    return () => {
      mounted = false;
    };
  }, [canton]);

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Cargando ubicación...</p>}
      <label>
        Provincia
        <select
          value={provincia}
          disabled={loading}
          onChange={(e) => {
            setProvincia(e.target.value);
            setCanton("");
            setCantones([]);
            setDistritos([]);
            setForm((current) => ({ ...current, distritoId: "" }));
          }}
        >
          <option value="">Seleccionar provincia</option>
          {provincias.map((row) => (
            <option key={row.ProvinciaId} value={row.ProvinciaId}>
              {row.Nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cantón
        <select
          value={canton}
          disabled={!provincia || loading}
          onChange={(e) => {
            setCanton(e.target.value);
            setDistritos([]);
            setForm((current) => ({ ...current, distritoId: "" }));
          }}
        >
          <option value="">Seleccionar cantón</option>
          {cantones.map((row) => (
            <option key={row.CantonId} value={row.CantonId}>
              {row.Nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        Distrito
        <select
          required={Boolean(form.detalleDireccion.trim())}
          disabled={!canton || loading}
          value={form.distritoId}
          onChange={(e) =>
            setForm((current) => ({ ...current, distritoId: e.target.value }))
          }
        >
          <option value="">Seleccionar distrito</option>
          {distritos.map((row) => (
            <option key={row.DistritoId} value={row.DistritoId}>
              {row.Nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        Detalle de dirección
        <input
          maxLength={300}
          required={Boolean(form.distritoId)}
          value={form.detalleDireccion}
          onChange={(e) =>
            setForm((current) => ({
              ...current,
              detalleDireccion: e.target.value,
            }))
          }
        />
      </label>
      <p>
        La dirección es opcional. Si la indicás, completá el distrito y el
        detalle.
      </p>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => {
          setProvincia("");
          setCanton("");
          setCantones([]);
          setDistritos([]);
          setForm((current) => ({
            ...current,
            distritoId: "",
            detalleDireccion: "",
          }));
        }}
      >
        Quitar dirección
      </button>
    </>
  );
}
