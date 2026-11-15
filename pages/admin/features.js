export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/admin/featured",
      permanent: false,
    },
  };
}

export default function AdminFeaturesRedirectPage() {
  return null;
}
