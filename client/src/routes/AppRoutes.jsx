import { Outlet, Routes, Route } from "react-router-dom";
import { Login } from "../pages/login";
import Layout from "./Layout";
import NotFoundPage from "../pages/notFoundPage";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/*" element={<NotFoundPage />} />
      </Route>
      <Route path="/" element={<Login />} />
    </Routes>
  );
}
