import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";

import "./Marketplace.css";

const money = (amount) =>
  `₹${Number(amount || 0).toLocaleString("en-IN")}`;

const formatDate = (value) => {
  if (!value) return "Date unavailable";

  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleString("en-IN");
};

export default function Marketplace({ page = "Buy Seedlings" }) {
  const user = auth.currentUser;

  const [role, setRole] = useState("");
  const [roleLoading, setRoleLoading] = useState(true);

  const [seedlings, setSeedlings] = useState([]);
  const [vegetables, setVegetables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [prices, setPrices] = useState([]);

  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    category: "",
    price: "",
    quantity: "",
    unit: "kg",
    description: "",
    location: ""
  });

  const [listingType, setListingType] = useState("seedling");

  // Load user role
  useEffect(() => {
    let active = true;

    const loadRole = async () => {
      if (!user) {
        if (active) {
          setRole("");
          setRoleLoading(false);
        }
        return;
      }

      setRoleLoading(true);

      try {
        const userSnapshot = await getDoc(doc(db, "users", user.uid));

        if (!active) return;

        if (userSnapshot.exists()) {
          setRole(userSnapshot.data().role || "");
        } else {
          setRole("");
          setMessage("Your user profile was not found.");
        }
      } catch (error) {
        if (active) {
          setMessage(error.message || "Unable to load your user profile.");
          setRole("");
        }
      } finally {
        if (active) setRoleLoading(false);
      }
    };

    loadRole();

    return () => {
      active = false;
    };
  }, [user]);

  // Select default product type
  useEffect(() => {
    if (page === "Seedling Inventory" || page === "Buy Seedlings") {
      setListingType("seedling");
    } else if (
      page === "Sell Vegetables" ||
      page === "Browse Products" ||
      page === "Search Products" ||
      page === "Produce Marketplace"
    ) {
      setListingType(role === "farmer" ? "vegetable" : "seedling");
    } else if (role === "nursery" || role === "coordinator") {
      setListingType("seedling");
    } else if (role === "farmer") {
      setListingType("vegetable");
    }
  }, [page, role]);

  // Page types
  const isSeedlingPage = [
    "Buy Seedlings",
    "Nursery Marketplace",
    "Seedling Inventory"
  ].includes(page);

  const isProducePage = [
  "Produce Marketplace",
  "Browse Products",
  "Sell Vegetables"
].includes(page);

  const isSellingPage = [
    "Seedling Inventory",
    "Sell Vegetables"
  ].includes(page);

  const isOrderPage = [
    "My Orders",
    "My Purchases",
    "Customer Orders",
    "Order Coordination"
  ].includes(page);

  const isSellerOrderPage = [
    "Customer Orders",
    "Order Coordination"
  ].includes(page);

  const isInsightsPage = [
    "Market Insights",
    "Price Insights",
    "Sales Reports",
    "Activity Reports"
  ].includes(page);

  // Listen to product collections
  useEffect(() => {
    if (!user || roleLoading) {
      setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);

    let seedlingsLoaded = false;
    let vegetablesLoaded = false;
    let active = true;

    const updateLoading = () => {
      if (active && seedlingsLoaded && vegetablesLoaded) {
        setLoadingProducts(false);
      }
    };

    const unsubscribeSeedlings = onSnapshot(
      collection(db, "seedlings"),
      (snapshot) => {
        if (!active) return;

        setSeedlings(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
          }))
        );

        seedlingsLoaded = true;
        updateLoading();
      },
      (error) => {
        if (!active) return;

        setMessage(`Unable to load seedlings: ${error.message}`);
        seedlingsLoaded = true;
        updateLoading();
      }
    );

    const unsubscribeVegetables = onSnapshot(
      collection(db, "vegetables"),
      (snapshot) => {
        if (!active) return;

        setVegetables(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
          }))
        );

        vegetablesLoaded = true;
        updateLoading();
      },
      (error) => {
        if (!active) return;

        setMessage(`Unable to load vegetables: ${error.message}`);
        vegetablesLoaded = true;
        updateLoading();
      }
    );

    return () => {
      active = false;
      unsubscribeSeedlings();
      unsubscribeVegetables();
    };
  }, [user, roleLoading]);

  // Listen to orders
  useEffect(() => {
    if (!user || roleLoading || !role) {
      setLoadingOrders(false);
      return;
    }

    setLoadingOrders(true);

    const orderMap = new Map();
    const unsubscribers = [];
    const queryIds = new Map();

    let completedSubscriptions = 0;
    let active = true;

    const subscriptionCount = role === "coordinator" ? 1 : 2;

    const updateOrders = () => {
      if (!active) return;

      const result = Array.from(orderMap.values());

      result.sort((a, b) => {
        const dateA = a.createdAt?.toDate
          ? a.createdAt.toDate().getTime()
          : 0;
        const dateB = b.createdAt?.toDate
          ? b.createdAt.toDate().getTime()
          : 0;

        return dateB - dateA;
      });

      setOrders(result);
    };

    const subscribeToOrders = (ordersQuery, subscriptionKey) => {
      const unsubscribe = onSnapshot(
        ordersQuery,
        (snapshot) => {
          if (!active) return;

          const currentIds = new Set();

          snapshot.docs.forEach((item) => {
            currentIds.add(item.id);
            orderMap.set(item.id, {
              id: item.id,
              ...item.data()
            });
          });

          const previousIds = queryIds.get(subscriptionKey) || new Set();

          for (const id of previousIds) {
            if (!currentIds.has(id)) {
              orderMap.delete(id);
            }
          }

          queryIds.set(subscriptionKey, currentIds);

          if (subscriptionKey === "coordinator") {
            orderMap.clear();

            snapshot.docs.forEach((item) => {
              orderMap.set(item.id, {
                id: item.id,
                ...item.data()
              });
            });
          }

          updateOrders();

          completedSubscriptions += 1;

          if (completedSubscriptions >= subscriptionCount) {
            setLoadingOrders(false);
          }
        },
        (error) => {
          if (!active) return;

          console.error("Orders listener error:", error);
          setMessage(`Unable to load orders: ${error.message}`);

          completedSubscriptions += 1;

          if (completedSubscriptions >= subscriptionCount) {
            setLoadingOrders(false);
          }
        }
      );

      unsubscribers.push(unsubscribe);
    };

    if (role === "coordinator") {
      subscribeToOrders(collection(db, "orders"), "coordinator");
    } else {
      subscribeToOrders(
        query(collection(db, "orders"), where("buyerId", "==", user.uid)),
        "buyer"
      );

      subscribeToOrders(
        query(collection(db, "orders"), where("sellerId", "==", user.uid)),
        "seller"
      );
    }

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, role, roleLoading]);

  // Listen to market prices
  useEffect(() => {
    if (!user || roleLoading) {
      setLoadingPrices(false);
      return;
    }

    setLoadingPrices(true);

    const unsubscribe = onSnapshot(
      collection(db, "marketPrices"),
      (snapshot) => {
        const results = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }));

        results.sort((a, b) => {
          const dateA = a.recordedAt?.toDate
            ? a.recordedAt.toDate().getTime()
            : 0;
          const dateB = b.recordedAt?.toDate
            ? b.recordedAt.toDate().getTime()
            : 0;

          return dateB - dateA;
        });

        setPrices(results);
        setLoadingPrices(false);
      },
      (error) => {
        console.error("Market prices listener error:", error);
        setMessage(`Unable to load market prices: ${error.message}`);
        setLoadingPrices(false);
      }
    );

    return unsubscribe;
  }, [user, roleLoading]);

  // Calculations: keep these before conditional returns.
  const myOrders = orders.filter(
    (order) =>
      order.buyerId === user?.uid ||
      order.sellerId === user?.uid
  );

  const mySeedlings = seedlings.filter(
    (item) => item.ownerId === user?.uid
  );

  const myVegetables = vegetables.filter(
    (item) => item.sellerId === user?.uid
  );

  const products = [
    ...seedlings
      .filter((item) => item.status !== "inactive")
      .map((item) => ({
        ...item,
        productType: "seedling",
        sellerId: item.ownerId
      })),
    ...vegetables
      .filter((item) => item.status !== "inactive")
      .map((item) => ({
        ...item,
        productType: "vegetable",
        sellerId: item.sellerId
      }))
  ].filter((item) => {
    if (isSeedlingPage && item.productType !== "seedling") return false;
    if (isProducePage && item.productType !== "vegetable") return false;
    if (isSellingPage && item.sellerId !== user?.uid) return false;

    const searchableText = [
      item.name,
      item.category,
      item.cropType,
      item.location,
      item.description
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(search.toLowerCase().trim());
  });

  const visibleOrders = orders.filter((order) => {
    if (isSellerOrderPage) {
      if (role === "coordinator") return true;
      return order.sellerId === user?.uid;
    }

    return order.buyerId === user?.uid;
  });

  // Handle unauthenticated users
  if (!user) {
    return (
      <div className="marketplace-container">
        <h2>Marketplace</h2>
        <p>Please log in to access the marketplace.</p>
      </div>
    );
  }

  if (roleLoading) {
    return (
      <div className="marketplace-container">
        <h2>{page}</h2>
        <p>Loading your account...</p>
      </div>
    );
  }

  // Form helpers
  const updateForm = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value
    }));
  };

  // Create product listing
  const createListing = async (event) => {
    event.preventDefault();

    if (!user) {
      setMessage("Please log in before publishing a product.");
      return;
    }

    if (
      (page === "Seedling Inventory" && listingType !== "seedling") ||
      (page === "Sell Vegetables" && listingType !== "vegetable")
    ) {
      setMessage("The selected product type does not match this page.");
      return;
    }

    if (
      listingType === "seedling" &&
      !["nursery", "coordinator"].includes(role)
    ) {
      setMessage("Only nursery accounts can publish seedling listings.");
      return;
    }

    if (
      listingType === "vegetable" &&
      !["farmer", "coordinator"].includes(role)
    ) {
      setMessage("Only farmer accounts can publish vegetable listings.");
      return;
    }

    const price = Number(form.price);
    const quantity = Number(form.quantity);

    if (!form.name.trim()) {
      setMessage("Enter a product name.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setMessage("Enter a valid price greater than zero.");
      return;
    }

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      setMessage("Enter a whole-number quantity greater than zero.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const commonData = {
        name: form.name.trim(),
        category: form.category.trim(),
        price,
        availableQuantity: quantity,
        description: form.description.trim(),
        location: form.location.trim(),
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (listingType === "seedling") {
        await addDoc(collection(db, "seedlings"), {
          ...commonData,
          ownerId: user.uid,
          cropType: form.category.trim() || "General"
        });
      } else {
        await addDoc(collection(db, "vegetables"), {
          ...commonData,
          sellerId: user.uid,
          unit: form.unit
        });
      }

      setForm({
        name: "",
        category: "",
        price: "",
        quantity: "",
        unit: "kg",
        description: "",
        location: ""
      });

      setMessage("Product published successfully.");
    } catch (error) {
      console.error("Create listing error:", error);
      setMessage(error.message || "Unable to publish the product.");
    } finally {
      setBusy(false);
    }
  };

  // Place an order
  const placeOrder = async (product) => {
    if (!user) {
      setMessage("Please log in before placing an order.");
      return;
    }

    if (product.sellerId === user.uid) {
      setMessage("You cannot order your own product.");
      return;
    }

    if (role === "coordinator") {
      setMessage("Coordinator accounts cannot place marketplace orders.");
      return;
    }

    if (
      product.productType === "seedling" &&
      role !== "farmer" &&
      role !== "buyer"
    ) {
      setMessage("Your account role cannot order seedlings.");
      return;
    }

    if (product.productType === "vegetable" && role !== "buyer") {
      setMessage("Only buyer accounts can order vegetables.");
      return;
    }

    const enteredQuantity = window.prompt(
      `Enter quantity for ${product.name}:`,
      "1"
    );

    if (enteredQuantity === null) return;

    const quantityText = enteredQuantity.trim();

    if (!/^\d+$/.test(quantityText)) {
      setMessage("Enter a valid whole-number quantity.");
      return;
    }

    const quantity = Number(quantityText);

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      setMessage("Quantity must be greater than zero.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const collectionName =
        product.productType === "seedling" ? "seedlings" : "vegetables";

      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, collectionName, product.id);
        const productSnapshot = await transaction.get(productRef);

        if (!productSnapshot.exists()) {
          throw new Error("This product is no longer available.");
        }

        const currentProduct = productSnapshot.data();
        const availableQuantity = Number(currentProduct.availableQuantity || 0);

        if (currentProduct.status !== "active") {
          throw new Error("This product is no longer active.");
        }

        if (
          !Number.isSafeInteger(availableQuantity) ||
          availableQuantity < quantity
        ) {
          throw new Error("Insufficient stock available.");
        }

        const currentPrice = Number(currentProduct.price);

        if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
          throw new Error("This product has an invalid price.");
        }

        const sellerId =
          product.productType === "seedling"
            ? currentProduct.ownerId
            : currentProduct.sellerId;

        if (!sellerId || sellerId === user.uid) {
          throw new Error("This product cannot be ordered from this account.");
        }

        const totalAmount = currentPrice * quantity;
        const orderRef = doc(collection(db, "orders"));

        transaction.update(productRef, {
          availableQuantity: availableQuantity - quantity,
          updatedAt: serverTimestamp()
        });

        transaction.set(orderRef, {
          buyerId: user.uid,
          sellerId,
          items: [
            {
              productId: product.id,
              productType: product.productType,
              name: currentProduct.name,
              quantity,
              price: currentPrice,
              subtotal: totalAmount,
              unit:
                currentProduct.unit ||
                (product.productType === "seedling" ? "plant" : "unit")
            }
          ],
          totalAmount,
          orderType: product.productType,
          status: "pending",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      setMessage("Order placed successfully.");
    } catch (error) {
      console.error("Place order error:", error);
      setMessage(error.message || "Unable to place your order.");
    } finally {
      setBusy(false);
    }
  };

  // Update order status
  const changeOrderStatus = async (order, status) => {
    if (!user) return;

    if (!["accepted", "rejected", "completed"].includes(status)) {
      setMessage("Invalid order status.");
      return;
    }

    if (role !== "coordinator" && order.sellerId !== user.uid) {
      setMessage("You are not authorized to update this order.");
      return;
    }

    if (status === "completed" && order.status !== "accepted") {
      setMessage("Only accepted orders can be marked as completed.");
      return;
    }

    if (
      ["accepted", "rejected"].includes(status) &&
      order.status !== "pending"
    ) {
      setMessage("Only pending orders can be accepted or rejected.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await updateDoc(doc(db, "orders", order.id), {
        status,
        updatedAt: serverTimestamp()
      });

      setMessage(`Order updated to ${status}.`);
    } catch (error) {
      console.error("Update order error:", error);
      setMessage(error.message || "Unable to update the order.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="marketplace-container">
      <h2>{page}</h2>

      <p className="marketplace-subtitle">
        Manage agricultural products, orders, and market information.
      </p>

      {message && (
        <div className="marketplace-message" role="status">
          <span>{message}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}

      {/* Product listing form */}
      {isSellingPage && (
        <form className="marketplace-form" onSubmit={createListing}>
          <h3>Add Product</h3>

          <label>
            Product type
            <select
              value={listingType}
              onChange={(event) => setListingType(event.target.value)}
              disabled={
                page === "Seedling Inventory" ||
                page === "Sell Vegetables"
              }
            >
              {(role === "nursery" || role === "coordinator") && (
                <option value="seedling">Seedling</option>
              )}

              {(role === "farmer" || role === "coordinator") && (
                <option value="vegetable">Vegetable</option>
              )}
            </select>
          </label>

          <label>
            Product name
            <input
              name="name"
              value={form.name}
              onChange={updateForm}
              maxLength={100}
              required
            />
          </label>

          <label>
            Category / crop
            <input
              name="category"
              value={form.category}
              onChange={updateForm}
              maxLength={100}
            />
          </label>

          <label>
            Price in rupees
            <input
              name="price"
              type="number"
              min="0.01"
              step="0.01"
              value={form.price}
              onChange={updateForm}
              required
            />
          </label>

          <label>
            Available quantity
            <input
              name="quantity"
              type="number"
              min="1"
              step="1"
              value={form.quantity}
              onChange={updateForm}
              required
            />
          </label>

          {listingType === "vegetable" && (
            <label>
              Unit
              <select name="unit" value={form.unit} onChange={updateForm}>
                <option value="kg">Kilogram</option>
                <option value="quintal">Quintal</option>
                <option value="bundle">Bundle</option>
                <option value="piece">Piece</option>
              </select>
            </label>
          )}

          <label>
            Location
            <input
              name="location"
              value={form.location}
              onChange={updateForm}
              maxLength={150}
            />
          </label>

          <label>
            Description
            <textarea
              name="description"
              value={form.description}
              onChange={updateForm}
              rows="3"
              maxLength={1000}
            />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? "Please wait..." : "Publish Product"}
          </button>
        </form>
      )}

      {/* Order pages */}
      {isOrderPage && (
        <section className="marketplace-section">
          <h3>{isSellerOrderPage ? "Customer Orders" : "My Orders"}</h3>

          {loadingOrders ? (
            <p>Loading orders...</p>
          ) : visibleOrders.length === 0 ? (
            <p>No orders found.</p>
          ) : (
            visibleOrders.map((order) => (
              <article className="marketplace-order" key={order.id}>
                <div>
                  <strong>Order #{order.id.slice(0, 8)}</strong>

                  <p>
                    {(order.items || [])
                      .map((item) => `${item.name} × ${item.quantity}`)
                      .join(", ")}
                  </p>

                  <p>Total: {money(order.totalAmount)}</p>
                  <p>Ordered: {formatDate(order.createdAt)}</p>
                  <span>Status: {order.status || "pending"}</span>
                </div>

                {isSellerOrderPage &&
                  order.sellerId === user.uid &&
                  order.status === "pending" && (
                    <div className="marketplace-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => changeOrderStatus(order, "accepted")}
                      >
                        Accept
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => changeOrderStatus(order, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  )}

                {isSellerOrderPage &&
                  order.sellerId === user.uid &&
                  order.status === "accepted" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => changeOrderStatus(order, "completed")}
                    >
                      Mark Completed
                    </button>
                  )}
              </article>
            ))
          )}
        </section>
      )}

      {/* Market insights */}
      {isInsightsPage && (
        <section className="marketplace-section">
          <h3>Market Overview</h3>

          <div className="marketplace-stats">
            <div>
              <span>Seedling listings</span>
              <strong>{seedlings.length}</strong>
            </div>

            <div>
              <span>Produce listings</span>
              <strong>{vegetables.length}</strong>
            </div>

            <div>
              <span>My orders</span>
              <strong>{myOrders.length}</strong>
            </div>

            <div>
              <span>Market prices</span>
              <strong>{prices.length}</strong>
            </div>
          </div>

          {(page === "Sales Reports" || page === "Activity Reports") && (
            <>
              <h3>My Listings</h3>

              <div className="marketplace-stats">
                <div>
                  <span>My seedlings</span>
                  <strong>{mySeedlings.length}</strong>
                </div>

                <div>
                  <span>My vegetables</span>
                  <strong>{myVegetables.length}</strong>
                </div>
              </div>
            </>
          )}

          <h3>Recent Market Prices</h3>

          {loadingPrices ? (
            <p>Loading market prices...</p>
          ) : prices.length === 0 ? (
            <p>No market-price records are available yet.</p>
          ) : (
            prices.slice(0, 10).map((price) => (
              <article className="marketplace-order" key={price.id}>
                <div>
                  <strong>
                    {price.cropName || price.name || "Crop"}
                  </strong>

                  <p>
                    {price.marketName ||
                      price.location ||
                      "Market not specified"}
                  </p>

                  {price.recordedAt && (
                    <p>{formatDate(price.recordedAt)}</p>
                  )}
                </div>

                <strong>{money(price.price)}</strong>
              </article>
            ))
          )}
        </section>
      )}

      {/* Product browsing */}
      {!isOrderPage && !isInsightsPage && !isSellingPage && (
        <section className="marketplace-section">
          <div className="marketplace-toolbar">
            <h3>Available Products</h3>

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products or location..."
              aria-label="Search products"
            />
          </div>

          {loadingProducts ? (
            <p>Loading products...</p>
          ) : products.length === 0 ? (
            <p>No products found.</p>
          ) : (
            <div className="marketplace-grid">
              {products.map((product) => (
                <article
                  className="marketplace-product"
                  key={`${product.productType}-${product.id}`}
                >
                  <div className="marketplace-icon">
                    {product.productType === "seedling" ? "🌱" : "🥬"}
                  </div>

                  <h3>{product.name}</h3>

                  <p>
                    {product.description ||
                      product.category ||
                      product.cropType ||
                      "Agricultural product"}
                  </p>

                  <p>
                    Location: {product.location || "Not specified"}
                  </p>

                  <p>
                    Available: {Number(product.availableQuantity || 0)}{" "}
                    {product.unit ||
                      (product.productType === "seedling" ? "plants" : "units")}
                  </p>

                  <strong>
                    {money(product.price)} /{" "}
                    {product.unit ||
                      (product.productType === "seedling" ? "plant" : "unit")}
                  </strong>

                  {product.sellerId !== user.uid && (
                    <button
                      type="button"
                      disabled={busy || Number(product.availableQuantity) < 1}
                      onClick={() => placeOrder(product)}
                    >
                      {Number(product.availableQuantity) < 1
                        ? "Out of Stock"
                        : "Order"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}