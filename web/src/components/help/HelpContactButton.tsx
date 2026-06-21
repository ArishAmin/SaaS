"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HelpContactButton() {
  return (
    <Button asChild>
      <Link href="/contact">
        Contact support <Mail className="ml-2 h-4 w-4" />
      </Link>
    </Button>
  );
}
