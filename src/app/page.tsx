import { redirect } from "next/navigation";

// Landing page removida — plataforma interna de gestão de clientes.
// Usuários não autenticados são redirecionados para o login.
export default function Home() {
  redirect("/login");
}
