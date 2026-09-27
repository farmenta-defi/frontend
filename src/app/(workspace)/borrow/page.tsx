import { redirect } from "next/navigation";

export default function BorrowPage() {
  redirect("/market?tab=borrow");
}
