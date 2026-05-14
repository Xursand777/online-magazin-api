import { useState } from 'react';
import { Link, useParams, Routes, Route, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCategories, getCategoryProducts, searchProducts } from '../api/endpoints';
import ProductCard from '../components/ProductCard';

interface Category {
  id: number;
  name: string;
  slug: string;
  image?: string;
  children: Category[];
  is_catalog: boolean;
}

const Catalog = () => {
  const [searchParams] = useSearchParams();
  const searchQuery = (searchParams.get('q') || '').trim();
  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => getCategories().then(res => res.data.results || res.data),
  });

  return (
    <div className="flex flex-col md:flex-row w-full py-lg gap-lg min-h-[70vh]">
      {/* SideNavBar (Desktop) */}
      <aside className="hidden lg:block w-72 shrink-0 self-start sticky top-[80px]">
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant overflow-hidden">
          <div className="p-lg bg-surface-container-low border-b border-outline-variant">
            <h2 className="font-h3 text-h3 text-on-surface">Katalog</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Barcha bo'limlar</p>
          </div>
          <nav className="flex flex-col py-2 max-h-[calc(100vh-250px)] overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className="p-lg flex flex-col gap-4">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 bg-surface-container rounded-lg animate-pulse" />)}
              </div>
            ) : (
              categories.map(cat => (
                <CategoryMenuItem key={cat.id} category={cat} />
              ))
            )}
          </nav>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 w-full min-w-0">
        <Routes>
          <Route index element={<CatalogIndex categories={categories} isLoading={isLoading} searchQuery={searchQuery} />} />
          <Route path=":slug" element={<CategoryDetail categories={categories} />} />
        </Routes>
      </main>
    </div>
  );
};

// Recursive Menu Item Component
const CategoryMenuItem = ({ category, depth = 0 }: { category: Category; depth?: number }) => {
  const { slug } = useParams();
  const hasChildren = category.children && category.children.length > 0;
  
  // Check if this category or any of its children is active
  const isActive = category.slug === slug;
  const isChildActive = (cat: Category): boolean => {
    if (cat.slug === slug) return true;
    return cat.children?.some(isChildActive) || false;
  };
  const shouldBeOpen = isActive || isChildActive(category);

  const [isOpen, setIsOpen] = useState(shouldBeOpen);

  return (
    <div className="flex flex-col">
      <div className="flex items-center group">
        <Link 
          to={`/catalog/${category.slug}`}
          className={`flex-1 flex items-center gap-3 px-lg py-3 transition-colors ${depth > 0 ? 'pl-12' : ''} ${
            isActive 
              ? 'bg-primary text-on-primary font-bold shadow-sm rounded-r-full mr-4' 
              : 'text-on-surface hover:bg-primary-container/10'
          }`}
        >
          {depth === 0 && (
            <span className={`material-symbols-outlined transition-colors ${isActive ? 'text-on-primary' : 'text-outline group-hover:text-primary'}`}>
              category
            </span>
          )}
          <span className={`font-body-md ${depth === 0 ? 'tracking-tight' : ''}`}>{category.name}</span>
        </Link>
        {hasChildren && (
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`p-3 transition-all ${isActive ? 'text-on-primary absolute right-8' : 'text-outline hover:text-primary'}`}
          >
            <span className={`material-symbols-outlined transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
          </button>
        )}
      </div>
      {isOpen && hasChildren && (
        <div className="bg-surface-container-lowest/30 border-l border-outline-variant/30 ml-6">
          {category.children.map(child => (
            <CategoryMenuItem key={child.id} category={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

// Default Catalog View (List of all Catalogs)
const CatalogIndex = ({ categories, isLoading, searchQuery }: { categories: Category[], isLoading: boolean, searchQuery: string }) => {
  const { data: searchResults = [], isLoading: isSearchLoading } = useQuery({
    queryKey: ['catalog-search', searchQuery],
    queryFn: () => searchProducts(searchQuery, true).then(res => res.data),
    enabled: Boolean(searchQuery),
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  if (searchQuery) {
    return (
      <div className="flex flex-col gap-xl">
        <div className="flex flex-col gap-2 border-b border-outline-variant pb-lg md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-h1 font-h1 text-on-background">Qidiruv natijalari</h1>
            <p className="text-body-lg text-on-surface-variant">
              "{searchQuery}" bo'yicha {searchResults.length} ta mahsulot topildi
            </p>
          </div>
          <Link to="/catalog" className="text-primary font-semibold hover:underline">
            Katalog bo'limlariga qaytish
          </Link>
        </div>

        {isSearchLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-lg">
            <SkeletonGrid count={8} />
          </div>
        ) : searchResults.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-lg">
            {searchResults.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="bg-surface-container-low rounded-3xl p-2xl text-center flex flex-col items-center gap-4 border-2 border-dashed border-outline-variant">
            <span className="material-symbols-outlined text-6xl text-outline opacity-20">search_off</span>
            <p className="text-on-surface-variant font-body-lg">Bu so'rov bo'yicha mahsulot topilmadi.</p>
          </div>
        )}
      </div>
    );
  }

  if (isLoading) return <div className="grid grid-cols-2 md:grid-cols-3 gap-lg"><SkeletonGrid count={6} /></div>;

  return (
    <div className="flex flex-col gap-2xl">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 font-h1 text-on-background">Barcha bo'limlar</h1>
        <p className="text-body-lg text-on-surface-variant">O'zingizga kerakli bo'limni tanlang</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-lg">
        {categories.map(cat => (
          <Link 
            key={cat.id} 
            to={`/catalog/${cat.slug}`}
            className="group bg-surface-container-lowest rounded-3xl border border-outline-variant p-6 hover:-translate-y-1 hover:border-primary/45 hover:bg-primary-container/5 hover:shadow-xl dark:hover:border-outline dark:hover:bg-surface-container-high transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary-container/20 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-all duration-300">
                {cat.image ? (
                  <img src={cat.image} alt={cat.name} className="w-full h-full object-cover rounded-2xl" />
                ) : (
                  <span className="material-symbols-outlined text-3xl">category</span>
                )}
              </div>
              <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">arrow_forward_ios</span>
            </div>
            <h3 className="text-h3 font-h3 text-on-surface mb-2">{cat.name}</h3>
            <p className="text-body-sm text-on-surface-variant mb-4">{cat.children?.length || 0} ta quyi bo'lim</p>
            
            <div className="flex flex-wrap gap-2">
              {cat.children?.slice(0, 3).map(child => (
                <span key={child.id} className="bg-surface-container px-3 py-1 rounded-full text-xs text-on-surface-variant">
                  {child.name}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

// Detailed Category View (Subcategories & Products)
const CategoryDetail = ({ categories }: { categories: Category[] }) => {
  const { slug } = useParams();
  const navigate = useNavigate();
  
  // Find category in tree
  const findCategory = (tree: Category[], slug?: string): Category | null => {
    if (!slug) return null;
    for (const cat of tree) {
      if (cat.slug === slug) return cat;
      const child = findCategory(cat.children || [], slug);
      if (child) return child;
    }
    return null;
  };

  const category = findCategory(categories, slug);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['category-products', category?.id],
    queryFn: () => category ? getCategoryProducts(category.id).then(res => res.data.results || res.data) : [],
    enabled: !!category,
  });

  if (!category && categories.length > 0) {
    return <div className="p-xl text-center">Kategoriya topilmadi.</div>;
  }

  return (
    <div className="flex flex-col gap-xl animate-in fade-in duration-500">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-body-sm text-on-surface-variant">
        <Link to="/catalog" className="hover:text-primary transition-colors">Katalog</Link>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="text-on-surface font-semibold">{category?.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-md border-b border-outline-variant pb-xl">
        <div>
          <h1 className="text-h1 font-h1 text-on-background mb-2">{category?.name}</h1>
          <p className="text-body-lg text-on-surface-variant">
            {products.length} ta mahsulot topildi
          </p>
        </div>
      </div>

      {/* Subcategories Grid if any */}
      {category?.children && category.children.length > 0 && (
        <section className="flex flex-col gap-lg">
          <h2 className="text-h3 font-h3 text-on-surface">Bo'limlar</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {category.children.map(child => (
              <Link 
                key={child.id} 
                to={`/catalog/${child.slug}`}
                className="bg-surface-container-low rounded-2xl p-4 flex flex-col items-center text-center gap-3 hover:bg-primary-container/20 transition-all border border-transparent hover:border-primary/20"
              >
                <div className="w-12 h-12 rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined">grid_view</span>
                </div>
                <span className="text-label-md font-label-md text-on-surface line-clamp-1">{child.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Products Grid */}
      <section className="flex flex-col gap-lg mt-xl">
        <h2 className="text-h3 font-h3 text-on-surface">Mahsulotlar</h2>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-lg">
            <SkeletonGrid count={8} />
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-lg">
            {products.map((p: any) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="bg-surface-container-low rounded-3xl p-2xl text-center flex flex-col items-center gap-4 border-2 border-dashed border-outline-variant">
            <span className="material-symbols-outlined text-6xl text-outline opacity-20">inventory_2</span>
            <p className="text-on-surface-variant font-body-lg">Hozircha mahsulotlar yo'q.</p>
            <button onClick={() => navigate('/catalog')} className="text-primary font-semibold hover:underline">Boshqa bo'limga o'tish</button>
          </div>
        )}
      </section>
    </div>
  );
};

const SkeletonGrid = ({ count }: { count: number }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-surface-container-lowest rounded-3xl p-6 border border-outline-variant flex flex-col gap-4 animate-pulse">
        <div className="w-full aspect-square bg-surface-container rounded-2xl" />
        <div className="h-6 w-3/4 bg-surface-container rounded-lg" />
        <div className="h-4 w-1/2 bg-surface-container rounded-lg" />
      </div>
    ))}
  </>
);

export default Catalog;
