// checked-1
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { QRCodeCanvas } from "qrcode.react";
import { saveCustomers, loadCustomers, importCSV, exportToCSV } from "../utils/storage";
import { sendWhatsApp, sendSMS } from "../utils/notifications";
import CustomerGroup from "../components/CustomerGroup";
import "../styles/CustomerHistory.css";
// hello changes
const downloadPDF = (customer) => {
  const doc = new jsPDF();
  // nothing worng
  doc.setFillColor(33, 150, 243);
  doc.rect(0, 0, 210, 30, "F");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("Credit Statement", 14, 15);
  doc.setFontSize(12);
  doc.text(`Customer: ${customer.name}`, 14, 25);
  doc.setTextColor(0, 0, 0);
  doc.text(`Phone: ${customer.phone || "N/A"}`, 14, 40);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 50);

  const rows = (customer.history || []).map((entry, index) => [
    index + 1,
    entry.type === "credit" ? "Credit" : "Payment",
    entry.date,
    entry.items?.join(", ") || "-",
    `₹${entry.amount.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: 60,
    head: [["#", "Type", "Date", "Items", "Amount"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [33, 150, 243], textColor: [255, 255, 255] },
    bodyStyles: { textColor: [0, 0, 0] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        data.cell.styles.textColor =
          data.cell.text[0] === "Credit" ? [255, 0, 0] : [0, 128, 0];
      }
    },
  });

  const totalCredit = (customer.history || [])
    .filter((e) => e.type === "credit")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalPaid = (customer.history || [])
    .filter((e) => e.type === "payment")
    .reduce((sum, e) => sum + e.amount, 0);
  const balance = totalCredit - totalPaid;

  const summaryY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total Credit: ₹${totalCredit.toFixed(2)}`, 14, summaryY);
  doc.text(`Total Paid: ₹${totalPaid.toFixed(2)}`, 14, summaryY + 10);
  balance > 0
    ? doc.setTextColor(255, 0, 0)
    : doc.setTextColor(0, 128, 0);
  
  doc.text(`Balance Due: ₹${balance.toFixed(2)}`, 14, summaryY + 20);

  doc.setFillColor(33, 150, 243);
  doc.rect(0, 280, 210, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text("Thala Credit Manager", 14, 290);

  doc.save(`${customer.name}_statement.pdf`);
};

function CustomerHistory() {
  const [credits, setCredits] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [showFullHistory, setShowFullHistory] = useState({});
  const [filterOption, setFilterOption] = useState("all");
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const storedCustomers = loadCustomers();
    setCredits(storedCustomers);
    const storedGroups = JSON.parse(localStorage.getItem("groups")) || [];
    setGroups(storedGroups);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (credits.length > 0) {
      saveCustomers(credits);
    }
    if (groups.length > 0) {
      localStorage.setItem("groups", JSON.stringify(groups));
    }
  }, [credits, groups]);

  const getBalance = (customer) =>
    (customer.history || []).reduce(
      (sum, entry) => (entry.type === "credit" ? sum + entry.amount : sum - entry.amount),
      0
    );

  const handleNotification = (customer) => {
    if (!customer.phone) {
      alert(t("noPhoneAvailable"));
      return;
    }
    const balance = getBalance(customer);
    const qrData = `Pay ₹${balance.toFixed(2)} to Thala Credit Manager`;
    const message = t("notificationMessage", {
      name: customer.name,
      balance: balance.toFixed(2),
      gpayLink: "https://gpay.app.goo.gl/pay",
    });
    sendWhatsApp(customer.phone, `${message}\nQR Code: [Attached]`);

    const group = groups.find((g) => g.members.includes(customer.id));
    if (group) {
      group.members
        .filter((id) => id !== customer.id)
        .forEach((id) => {
          const member = credits.find((c) => c.id === id);
          if (member?.phone && member?.smsEnabled) {
            sendSMS(
              member.phone,
              t("groupNotification", {
                customerName: customer.name,
                balance: balance.toFixed(2),
              })
            );
            sendWhatsApp(
              member.phone,
              t("groupNotification", {
                customerName: customer.name,
                balance: balance.toFixed(2),
              })
            );
          }
        });
    }

    // Simulate QR code attachment
    const qrCanvas = document.createElement("canvas");
    qrCanvas.id = `qr-${customer.id}`;
    document.body.appendChild(qrCanvas);
    // QRCode.toCanvas(qrCanvas, qrData); // Uncomment if using real QR rendering
    alert(t("qrCodeGenerated", { qrData }));
    document.body.removeChild(qrCanvas);
  };

  const deleteCredit = (customerId, entryIndex) => {
    const updatedCredits = credits.map((c) =>
      c.id === customerId
        ? { ...c, history: c.history.filter((_, i) => i !== entryIndex) }
        : c
    );
    setCredits(updatedCredits);
    const customer = credits.find((c) => c.id === customerId);
    if (customer.phone && customer.smsEnabled) {
      sendSMS(customer.phone, t("transactionDeletedSMS", { name: customer.name }));
      sendWhatsApp(customer.phone, t("transactionDeletedWhatsApp", { name: customer.name }));
    }
  };

  const toggleExpand = (customerId) => {
    setExpandedCustomer(expandedCustomer === customerId ? null : customerId);
  };

  const toggleFullHistory = (customerId) => {
    setShowFullHistory((prev) => ({
      ...prev,
      [customerId]: !prev[customerId],
    }));
  };

  const addToGroup = (customerId) => {
    const groupName = prompt(t("enterGroupName"));
    if (!groupName) return;
    setGroups((prev) => {
      const existingGroup = prev.find((g) => g.name === groupName);
      if (existingGroup) {
        return prev.map((g) =>
          g.name === groupName
            ? { ...g, members: [...new Set([...g.members, customerId])] }
            : g
        );
      }
      return [...prev, { name: groupName, members: [customerId] }];
    });
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (file) {
      importCSV(file, (newCustomers) => {
        setCredits((prev) => {
          const updated = [...prev];
          newCustomers.forEach((newC) => {
            const existing = updated.find((c) => c.phone === newC.phone);
            if (existing) {
              existing.history = newC.history?.slice(-5) || [];
            } else {
              updated.push({ ...newC, id: Date.now(), history: newC.history?.slice(-5) || [] });
            }
          });
          return updated;
        });
      });
    }
  };

  const filteredCredits = selectedGroup
    ? credits.filter((c) => selectedGroup.members.includes(c.id))
    : credits
        .filter((customer) => {
          const searchMatch =
            customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            customer.phone?.includes(searchTerm) ||
            (customer.history || []).some((entry) => entry.date.includes(searchTerm));

          if (!searchMatch) return false;

          const unpaidBalance = getBalance(customer);
          if (filterOption === "unpaid") return unpaidBalance > 0;
          if (filterOption === "paid") return unpaidBalance <= 0;
          return true;
        })
        .sort((a, b) => (b.history?.length || 0) - (a.history?.length || 0));

  if (isLoading) return <div className="loading">{t("loadingHistory")}</div>;

  return (
    <div className="customer-history">
      <h2>{t("customerHistory")}</h2>
      <div className="history-controls">
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          value={filterOption}
          onChange={(e) => setFilterOption(e.target.value)}
        >
          <option value="all">{t("all")}</option>
          <option value="unpaid">{t("unpaid")}</option>
          <option value="paid">{t("paid")}</option>
        </select>
        <button onClick={() => exportToCSV(credits)}>{t("exportCSV")}</button>
        <input type="file" accept=".csv" onChange={handleCSVImport} />
        <button onClick={() => navigate("/main")}>{t("backToTracker")}</button>
      </div>
      <h3>{t("groups")}</h3>
      <CustomerGroup
        groups={groups}
        credits={credits}
        onSelectGroup={setSelectedGroup}
      />
      <ul>
        {filteredCredits.map((customer) => (
          <li key={customer.id}>
            <div className="customer-header">
              <button
                onClick={() => toggleExpand(customer.id)}
                style={{ marginRight: "10px" }}
              >
                {expandedCustomer === customer.id ? "▼" : "▶"}
              </button>
              <h3>
                {customer.name} ({customer.phone || t("noPhone")})
                <span
                  style={{
                    marginLeft: "10px",
                    color: getBalance(customer) > 0 ? "red" : "green",
                  }}
                >
                  {t("balance")}: ₹{getBalance(customer).toFixed(2)}
                </span>
              </h3>
              {expandedCustomer !== customer.id && (
                <>
                  <button
                    onClick={() => handleNotification(customer)}
                    style={{ marginLeft: "10px" }}
                  >
                    {t("sendNotification")}
                  </button>
                  <button
                    onClick={() => downloadPDF(customer)}
                    style={{ marginLeft: "10px" }}
                  >
                    {t("downloadPDF")}
                  </button>
                  <button
                    onClick={() => addToGroup(customer.id)}
                    style={{ marginLeft: "10px" }}
                  >
                    {t("addToGroup")}
                  </button>
                </>
              )}
            </div>
            {expandedCustomer === customer.id && (
              <div>
                <ul>
                  {(showFullHistory[customer.id]
                    ? customer.history || []
                    : (customer.history || []).slice(-5)
                  ).map((entry, eIndex) => (
                    <li
                      key={eIndex}
                      style={{
                        color: entry.type === "credit" ? "red" : "green",
                        marginBottom: "10px",
                      }}
                    >
                      ₹{entry.amount.toFixed(2)} — {entry.items?.join(", ") || "-"} —{" "}
                      {entry.date} {entry.time || ""}
                      <button
                        onClick={() => deleteCredit(customer.id, eIndex)}
                        style={{ marginLeft: "10px" }}
                      >
                        {t("delete")}
                      </button>
                    </li>
                  ))}
                </ul>
                {(customer.history || []).length > 5 && (
                  <button
                    onClick={() => toggleFullHistory(customer.id)}
                    style={{ marginTop: "10px" }}
                  >
                    {showFullHistory[customer.id] ? t("showLess") : t("showAll")}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="summary">
        <h3>
          {t("totalHistoricalCredit")}: ₹
          {credits
            .reduce((sum, c) => sum + getBalance(c), 0)
            .toFixed(2)}
        </h3>
        <p>
          {t("showingCustomers", {
            filtered: filteredCredits.length,
            total: credits.length,
          })}
        </p>
      </div>
    </div>
  );
}

export default CustomerHistory;