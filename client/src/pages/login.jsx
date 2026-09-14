import React, { useState } from "react";
import { loginUser } from "../services/auth.Service";

export default function Login() {
  const [form, setForm] = useState({
    nombreUsuario: "",
    password: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await loginUser(form);
      // Guardaremos los datos públicos del usuario.
      console.log(result.user);
      navigate("/colaboradores");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }
}
