import type { Product } from "../catalog";

interface Props {
  product: Product;
  large?: boolean;
}

/** Small game art, or a monogram tile when there is none. */
export function Thumb({ product, large }: Props): JSX.Element {
  const className = large ? "thumb large" : "thumb";
  return product.art ? (
    <img className={className} src={product.art} alt="" />
  ) : (
    <div className={large ? "mono large" : "mono"} style={{ color: product.accent }}>
      {product.mark}
    </div>
  );
}
