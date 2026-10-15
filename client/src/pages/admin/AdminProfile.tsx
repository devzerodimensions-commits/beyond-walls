import { AdminPageHeader } from '../../components/admin/AdminKit';
import AccountProfile from '../account/AccountProfile';

export default function AdminProfile() {
  return (
    <>
      <AdminPageHeader
        title="Your profile"
        description="Update your administrator contact details and password."
      />
      <AccountProfile />
    </>
  );
}
