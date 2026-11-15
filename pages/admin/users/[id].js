import { useRouter } from "next/router";
import { getAdminPageProps } from "../../../lib/session";
import AdminAccessGate from "../../../components/AdminAccessGate";
import AdminPersonDetail from "../../../components/AdminPersonDetail";

export async function getServerSideProps(context) {
  const access = await getAdminPageProps(context);
  return { props: access };
}

export default function AdminUserDetailPage({
  authorized = false,
  dbConfigured = true,
  signedInEmail = null,
  currentRole = null,
  emailVerified = false,
}) {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";

  if (!authorized || currentRole !== "ADMIN") {
    return (
      <AdminAccessGate
        dbConfigured={dbConfigured}
        signedInEmail={signedInEmail}
        currentRole={currentRole}
        emailVerified={emailVerified}
        callbackUrl={id ? `/admin/users/${id}` : "/admin/users"}
      />
    );
  }

  return <AdminPersonDetail personId={id} kind="user" />;
}
