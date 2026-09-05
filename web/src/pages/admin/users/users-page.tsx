import { AdminPageFrame } from "../components/admin-shell";
import { useAdminContext } from "../admin-context";
import UsersPanel from "./users-panel";

export default function UsersPage() {
    const { updateUserReference } = useAdminContext();
    return (
        <AdminPageFrame title="用户管理" description="邀请成员加入，管理账号权限并查看积分记录">
            <UsersPanel onUserChanged={updateUserReference} />
        </AdminPageFrame>
    );
}
