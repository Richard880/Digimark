
import { Outlet, Link, useLocation } from 'react-router';

export default function VendorLayout() {
  const location = useLocation();

  const isCurrent = (path) => location.pathname === path ? 'active text-white' : 'text-dark';

  return (
    <div className="container-fluid">
      <div className="row min-vh-100">
        {/* Sidebar Workspace Navigation */}
        <aside className="col-md-3 col-lg-2 bg-white border-end px-3 py-4 position-fixed h-100">
          <div className="mb-4 text-center">
            <Link className="h4 fw-bold text-success text-decoration-none" to="/">
              digimark <span className="badge bg-dark fs-6 font-monospace">SELLER</span>
            </Link>
          </div>
          
          <hr />
          
          <ul className="nav nav-pills flex-column mb-auto">
            <li className="nav-item mb-2">
              <Link to="/vendor" className={`nav-link ${isCurrent('/vendor')}`}>
                <i className="bi bi-speedometer2 me-2"></i> Dashboard
              </Link>
            </li>
            <li className="nav-item mb-2">
              <Link to="/vendor/products" className={`nav-link ${isCurrent('/vendor/products')}`}>
                <i className="bi bi-box-seam me-2"></i> Inventory Items
              </Link>
            </li>
            <li className="nav-item mb-2">
              <Link to="/vendor/sales" className={`nav-link ${isCurrent('/vendor/sales')}`}>
                <i className="bi bi-currency-dollar me-2"></i> Sales Pipeline
              </Link>
            </li>
          </ul>
        </aside>

        {/* Dashboard Work Content Viewport */}
        <main className="col-md-9 ms-sm-auto col-lg-10 px-md-4 py-4" style={{ marginLeft: '16.666667%' }}>
          <header className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
            <h1 className="h2 text-dark">Merchant Workspace</h1>
            <Link to="/" className="btn btn-sm btn-outline-secondary">
              <i className="bi bi-arrow-left"></i> Exit to Market
            </Link>
          </header>
          
          <Outlet />
        </main>
      </div>
    </div>
  );
}
