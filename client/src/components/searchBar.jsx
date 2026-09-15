import { Search, X } from "lucide-react";

export default function SearchBar({
  search,
  setSearch,
  entidad,
  id = "search",
  placeholder,
}) {
  function clearSearch() {
    setSearch("");
  }

  return (
    <div className="search-group">
      <label htmlFor={id}>Buscar {entidad ?? "por nombre"}</label>

      <div className="search-field">
        <Search size={18} aria-hidden="true" />

        <input
          id={id}
          type="search"
          placeholder={placeholder ?? `Buscar ${entidad?.toLowerCase() ?? "registro"}...`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {search && (
          <button
            type="button"
            className="clear-search"
            aria-label="Limpiar búsqueda"
            onClick={clearSearch}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
