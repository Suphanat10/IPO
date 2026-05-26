"use client";

import * as React from "react";
import {
  Autocomplete,
  Box,
  Link,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import SectionCard from "../components/SectionCard";
import LabeledField from "../components/LabeledField";
import ConclusionView from "../components/ConclusionView";
import EntityDetailView from "../components/EntityDetailView";
import ReferenceLink from "../components/ReferenceLink";
import { useAnalysis } from "../lib/AnalysisContext";
import { useDropdownOptions } from "../lib/useDropdownOptions";
import { generateFAConclusion } from "../lib/ipoAnalytics";
import { createFuzzyFilter } from "../lib/fuzzyMatch";

const filterPerson = createFuzzyFilter("person");
const filterCompany = createFuzzyFilter("company");

function Hint({ topic, keyword }: { topic: string; keyword: string }) {
  return (
    <Typography component="span" variant="caption" color="text.secondary">
      หัวข้อ:{" "}
      <Link underline="hover" color="primary.main">
        {topic}
      </Link>
      &nbsp;|&nbsp;<b>Keyword:</b>{" "}
      <Box component="span" sx={{ color: "error.main" }}>
        {keyword}
      </Box>
    </Typography>
  );
}

export default function FAAnalysis() {
  const { fa, setFA } = useAnalysis();
  const [tab, setTab] = React.useState(0);
  const { faPersons: faPersonOptions, faCompanies: faCompanyOptions } = useDropdownOptions();

  const conclusion = React.useMemo(
    () => generateFAConclusion(fa.person, fa.company),
    [fa.person, fa.company],
  );

  // Available tabs depend on which inputs are filled
  const tabDefs: Array<{ key: string; label: string; render: () => React.ReactElement }> = [];
  if (fa.person || fa.company) {
    tabDefs.push({
      key: "conclusion",
      label: "Conclusion",
      render: () => (
        <ConclusionView
          header={
            <>
              <Box>FA Person: {fa.person ?? "-"}</Box>
              <Box>FA Company: {fa.company ?? "-"}</Box>
            </>
          }
          conclusion={conclusion}
        />
      ),
    });
  }
  if (fa.person) {
    tabDefs.push({
      key: "person",
      label: "FA Person",
      render: () => <EntityDetailView mode="person" person={fa.person!} />,
    });
  }
  if (fa.company) {
    tabDefs.push({
      key: "company",
      label: "FA Company",
      render: () => <EntityDetailView mode="company" company={fa.company!} />,
    });
  }
  if (fa.person && fa.company) {
    tabDefs.push({
      key: "matched",
      label: "Matched",
      render: () => (
        <EntityDetailView mode="matched" person={fa.person!} company={fa.company!} />
      ),
    });
  }

  const safeTab = Math.min(tab, Math.max(0, tabDefs.length - 1));

  return (
    <SectionCard
      title="FA Analysis"
      subtitle="วิเคราะห์สถิติของที่ปรึกษาทางการเงิน (บุคคล / บริษัท)"
      icon={<AssignmentIndRoundedIcon fontSize="small" />}
    >
      <Stack spacing={2.5}>
        <Box
          sx={{
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            p: { xs: 2, md: 2.5 },
            bgcolor: "#fafbfd",
          }}
        >
          <Stack spacing={1}>
            <LabeledField
              label="FA_PERSON"
              hint={
                <>
                  <Hint topic="รายละเอียดตราสาร" keyword="ที่ปรึกษาทางการเงิน/ผู้ควบคุม" />
                  <ReferenceLink
                    example={{
                      value: "ณัฐวุฒิ พัฒนาการ",
                      excerpt:
                        "รายชื่อที่ปรึกษาทางการเงินและผู้ควบคุม\n1) นายณัฐวุฒิ พัฒนาการ  (FA)\n2) นางสาวอัญชลี ศรีสุวรรณ  (ผู้ควบคุม)",
                      source: "Filing 56-1: หัวข้อ รายละเอียดตราสาร",
                      note: "ตัดคำนำหน้าชื่อ (นาย/นาง/นางสาว) ออกก่อนกรอก",
                    }}
                  />
                </>
              }
            >
              <Autocomplete
                size="small"
                freeSolo
                options={faPersonOptions}
                filterOptions={filterPerson}
                inputValue={fa.person || ""}
                onInputChange={(_, v) => setFA({ person: v || null })}
                renderInput={(params) => (
                  <TextField {...params} placeholder="พิมพ์ชื่อ FA Person" />
                )}
              />
            </LabeledField>
            <LabeledField
              label="FA_COMPANY"
              hint={
                <>
                  <Hint topic="รายละเอียดตราสาร" keyword="ที่ปรึกษาทางการเงิน/ผู้ควบคุม" />
                  <ReferenceLink
                    example={{
                      value: "ทรีนิตี้ แอดไวซอรี่",
                      excerpt:
                        "ที่ปรึกษาทางการเงิน\nบริษัท ทรีนิตี้ แอดไวซอรี่ จำกัด\nผู้ควบคุม: นายสมชาย จันทร์ประเสริฐ",
                      source: "Filing 56-1: หัวข้อ รายละเอียดตราสาร",
                      note: "ตัดคำว่า บริษัท / จำกัด / (มหาชน) ออกก่อนกรอก",
                    }}
                  />
                </>
              }
            >
              <Autocomplete
                size="small"
                freeSolo
                options={faCompanyOptions}
                filterOptions={filterCompany}
                inputValue={fa.company || ""}
                onInputChange={(_, v) => setFA({ company: v || null })}
                renderInput={(params) => (
                  <TextField {...params} placeholder="พิมพ์ชื่อ FA Company" />
                )}
              />
            </LabeledField>
          </Stack>
        </Box>

        {tabDefs.length > 0 ? (
          <Box
            sx={{
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <Tabs
              value={safeTab}
              onChange={(_, v) => setTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ borderBottom: "1px solid", borderColor: "divider" }}
            >
              {tabDefs.map((t) => (
                <Tab key={t.key} label={t.label} />
              ))}
            </Tabs>
            <Box sx={{ p: 2 }}>{tabDefs[safeTab].render()}</Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
            กรอกชื่อ FA Person หรือ FA Company เพื่อดูผลวิเคราะห์
          </Typography>
        )}
      </Stack>
    </SectionCard>
  );
}
