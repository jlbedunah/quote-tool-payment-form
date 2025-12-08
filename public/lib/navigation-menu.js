/**
 * Navigation Menu Component
 * Creates a navigation menu for authenticated pages
 * Shows different items based on user role (admin vs regular user)
 */

/**
 * Initialize and render the navigation menu
 * @param {Object} user - Current user object with is_admin property
 */
export function initNavigationMenu(user) {
  // Get or create navigation container
  let navContainer = document.getElementById('navigation-menu');
  
  if (!navContainer) {
    // Create navigation container
    navContainer = document.createElement('nav');
    navContainer.id = 'navigation-menu';
    navContainer.className = 'bg-white border-b border-gray-200 shadow-sm';
    
    // Insert at the beginning of body or after a specific element
    const body = document.body;
    const firstChild = body.firstElementChild;
    if (firstChild) {
      body.insertBefore(navContainer, firstChild);
    } else {
      body.appendChild(navContainer);
    }
  }

  // Build menu HTML
  const menuHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <!-- Logo/Brand -->
        <div class="flex items-center">
          <div class="flex items-center">
            <div class="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center mr-3">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <div class="text-left">
              <div class="text-lg font-bold">
                <span class="text-black">My</span>
                <span class="text-red-600" style="color: #CA1824;">Bookkeepers.com</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Navigation Links -->
        <div class="flex items-center space-x-1">
          <a href="/quote-tool.html" 
             class="px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-red-600 transition-colors duration-200 font-medium ${window.location.pathname.includes('quote-tool') ? 'bg-red-50 text-red-600' : ''}">
            Quote Tool
          </a>
          <a href="/admin-products.html" 
             class="px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-red-600 transition-colors duration-200 font-medium ${window.location.pathname.includes('admin-products') ? 'bg-red-50 text-red-600' : ''}">
            Products
          </a>
          <a href="/quotes.html" 
             class="px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-red-600 transition-colors duration-200 font-medium ${window.location.pathname.includes('quotes.html') ? 'bg-red-50 text-red-600' : ''}">
            Quotes
          </a>
          ${user && user.is_admin ? `
          <a href="/admin-users.html" 
             class="px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-red-600 transition-colors duration-200 font-medium ${window.location.pathname.includes('admin-users') ? 'bg-red-50 text-red-600' : ''}">
            User Management
          </a>
          <a href="/admin-logs.html" 
             class="px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-red-600 transition-colors duration-200 font-medium ${window.location.pathname.includes('admin-logs') ? 'bg-red-50 text-red-600' : ''}">
            Logs
          </a>
          ` : ''}
          
          <!-- User Info & Logout -->
          <div class="ml-4 flex items-center space-x-4 border-l border-gray-300 pl-4">
            <span class="text-sm text-gray-600">
              ${user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email : 'User'}
            </span>
            <button id="logout-button" 
                    class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 font-medium">
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  navContainer.innerHTML = menuHTML;

  // Add logout functionality
  const logoutButton = document.getElementById('logout-button');
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
}

/**
 * Handle logout
 */
async function handleLogout() {
  try {
    const accessToken = localStorage.getItem('supabase_access_token');
    
    // Call logout API
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': accessToken ? `Bearer ${accessToken}` : ''
      },
      body: JSON.stringify({
        session_token: accessToken
      })
    });

    // Clear local storage regardless of API response
    localStorage.removeItem('supabase_access_token');
    localStorage.removeItem('supabase_refresh_token');
    localStorage.removeItem('supabase_expires_at');
    localStorage.removeItem('current_user');

    // Redirect to login
    window.location.href = '/login.html';
  } catch (error) {
    console.error('Logout error:', error);
    // Still clear storage and redirect even if API call fails
    localStorage.removeItem('supabase_access_token');
    localStorage.removeItem('supabase_refresh_token');
    localStorage.removeItem('supabase_expires_at');
    localStorage.removeItem('current_user');
    window.location.href = '/login.html';
  }
}

/**
 * Check authentication and get current user
 * Returns user object or null if not authenticated
 */
export async function getCurrentUser() {
  try {
    const accessToken = localStorage.getItem('supabase_access_token');
    const refreshToken = localStorage.getItem('supabase_refresh_token');
    
    if (!accessToken) {
      return null;
    }

    const response = await fetch('/api/auth/me', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: refreshToken || null
      })
    });

    const data = await response.json();
    
    if (response.ok && data.success && data.user) {
      // Update localStorage with fresh user data
      localStorage.setItem('current_user', JSON.stringify(data.user));
      return data.user;
    } else {
      // Invalid session, clear storage
      localStorage.removeItem('supabase_access_token');
      localStorage.removeItem('supabase_refresh_token');
      localStorage.removeItem('supabase_expires_at');
      localStorage.removeItem('current_user');
      return null;
    }
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Initialize navigation menu with authentication check
 * Call this on page load
 */
export async function initNavigationWithAuth() {
  // Get current user
  const user = await getCurrentUser();
  
  if (!user) {
    // Not authenticated, redirect to login
    window.location.href = '/login.html';
    return;
  }

  // Initialize navigation menu with user data
  initNavigationMenu(user);
  
  return user;
}

