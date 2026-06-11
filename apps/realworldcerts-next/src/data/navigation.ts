import {
  BookOpen,
  BriefcaseBusiness,
  CreditCard,
  Grid2x2,
  LifeBuoy,
  ShieldCheck
} from "lucide-react";

export const navigationItems = [
  {
    label: "Overview",
    href: "/",
    icon: Grid2x2
  },
  {
    label: "Directory",
    href: "/directory",
    icon: BookOpen
  },
  {
    label: "Career Paths",
    href: "/directory?category=career-track",
    icon: BriefcaseBusiness
  },
  {
    label: "Practice",
    href: "/directory?category=practice-test",
    icon: ShieldCheck
  }
];

export const supportLinks = [
  {
    label: "Payments",
    href: "#payments",
    icon: CreditCard
  },
  {
    label: "Support",
    href: "#support",
    icon: LifeBuoy
  }
];
