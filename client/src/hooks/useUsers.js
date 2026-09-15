import { useEffect, useState } from "react";
import useAsyncRequest from "./useAsyncRequest";
import {
  getUsers,
  getUserById,
  registerUser,
  loginUser,
  changePassword,
} from "../services/auth.Service";

export function useUsers(deps = []) {
  const { data: users, isLoading, error } = useAsyncRequest(getUsers, deps);
  return { users: users ?? [], isLoading, error };
}

export function useUser(id){
    const { data: user, isLoading, error } = useAsyncRequest(() => getUserById(id), [id]);
    return { user, isLoading, error}
}

