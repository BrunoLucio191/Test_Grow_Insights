import { Button } from "@/components/ui/button";
import randomUserIcon from "../../assets/randomUserIcon.png";
import { signOut } from "../../services/auth.api";
import { toast } from "sonner";
import { LogOut } from "lucide-react";

type props = {
  userName: string | undefined;
};

export default function UserInfo({ userName }: props) {
  return (
    <div className="flex justify-between items-center rounded-md p-4 px-3 bg-sidebar-accent/40">
      <div className="w-15 h-15  border aspect-square rounded-full overflow-hidden">
        <img src={randomUserIcon}></img>
      </div>
      <div className="flex font-sans pb-1 pr-20 text-sidebar-foreground text-xl font-medium">
        {userName}
      </div>
      <Button
        variant="undefined"
        className=" w-15 h-10 gap-2   hover:text-destructive"
        onClick={async () => {
          try {
            await signOut(); // Aciona a função de logout do Supabase no servidor
            window.location.reload(); // Recarrega a página imediatamente após o sucesso
          } catch (error) {
            toast.error("Erro ao efetuar logout");
          }
        }}
      >
        <LogOut className="w-5  ! h-6!" />
      </Button>
    </div>
  );
}
