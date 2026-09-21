import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Product } from '../../lib/types';
import { ProductGrid } from '../../components/product/ProductCard';
import { ButtonLink, EmptyState, HeartIcon } from '../../components/ui';

interface WishlistRow {
  id: string;
  productId: string;
  product: Product;
}

export default function AccountWishlist() {
  const { data, isLoading } = useQuery({
    queryKey: ['wishlist-page'],
    queryFn: () => api.get<WishlistRow[]>('/wishlist'),
  });

  const products = (data ?? []).map((row) => row.product);

  if (isLoading) return <ProductGrid products={[]} loading columns={3} skeletonCount={6} />;

  if (!products.length) {
    return (
      <EmptyState
        icon={<HeartIcon size={32} />}
        title="Your wishlist is empty"
        description="Save products you like and find them here later."
        action={<ButtonLink to="/shop">Browse the shop</ButtonLink>}
      />
    );
  }

  return (
    <>
      <h2 className="mb-6 text-xs font-semibold uppercase tracking-architect">
        Wishlist ({products.length})
      </h2>
      <ProductGrid products={products} columns={3} />
    </>
  );
}
