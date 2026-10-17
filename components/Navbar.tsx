import Image from "next/image";
import Link from "next/link";

const Navbar = () => {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/icon.png"
            alt="PennyWise"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg"
            priority
          />
          <span className="text-lg font-bold tracking-tight text-gray-900">
            PennyWise
          </span>
        </Link>
      </div>
    </header>
  );
};

export default Navbar;
