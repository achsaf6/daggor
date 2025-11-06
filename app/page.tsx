import Image from "next/image";

export default function Home() {
  return (
    <div className="fixed inset-0 m-0 p-0 overflow-hidden">
      <Image
        src="/maps/city-assault-30-x-50-phased-v0-87llyi5jgauf1.png"
        alt="City Assault Map"
        fill
        className="object-contain"
        priority
      />
    </div>
  );
}
