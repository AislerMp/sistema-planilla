import { parseResponse } from "../utils/helper.js";

const API_URL = import.meta.env.VITE_API_URL;

function ensureApiUrl() {
  if (!API_URL) {
    throw new Error("Falta configurar VITE_API_URL en client/.env");
  }
}

export async function loginUser({ nombreUsuario, password }) {
  ensureApiUrl();

  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ nombreUsuario, password }),
  });

  return parseResponse(response);
}

export async function registerUser({
  nombreUsuario,
  password,
  rolId,
  colaboradorId,
}) {
  ensureApiUrl();

  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ nombreUsuario, password, rolId, colaboradorId }),
  });

  return parseResponse(response);
}

export async function changePassword({ currentPassword, newPassword }) {
  ensureApiUrl();

  const response = await fetch(`${API_URL}/auth/change-password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  return parseResponse(response);
}

export async function getUsers() {
  ensureApiUrl();

  const response = await fetch(`${API_URL}/auth/users`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getUserById(id) {
  ensureApiUrl();

  const response = await fetch(`${API_URL}/auth/users/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function activateUser(id) {
  ensureApiUrl();

  const response = await fetch(`${API_URL}/auth/users/activate/${id}`, {
    method: "POST",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function updateUser(id, { nombreUsuario, rolId, colaboradorId }) {
  ensureApiUrl();
  const response = await fetch(`${API_URL}/auth/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ nombreUsuario, rolId, colaboradorId }),
  });
  return parseResponse(response);
}

export async function deactivateUser(id) {
  ensureApiUrl();

  const response = await fetch(`${API_URL}/auth/users/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function getCurrentUser() {
  ensureApiUrl();

  const response = await fetch(`${API_URL}/auth/me`, {
    method: "GET",
    credentials: "include",
  });

  return parseResponse(response);
}

export async function logout() {
  ensureApiUrl();

  const response = await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });

  return parseResponse(response);
}

export default {
  updateUser,
  loginUser,
  registerUser,
  changePassword,
  getUsers,
  getUserById,
  activateUser,
  deactivateUser,
  getCurrentUser,
  logout,
};
