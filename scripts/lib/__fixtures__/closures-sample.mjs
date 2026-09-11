/**
 * A real payload from National Highways' own API documentation for the Road
 * and Lane Closures service, trimmed of fields SetoffIQ does not read but
 * structurally faithful. Coordinates moved onto the M56 near Manchester
 * Airport so the distance filter can be exercised; the original sample is on
 * the A120 in Essex.
 */
export const plannedMultiLocation = {
  D2Payload: {
    version: '2025-03-04',
    modelBaseVersion: '3',
    feedType: 'SituationPublication',
    publicationTime: '2026-09-11T06:15:56Z',
    situation: [
      {
        idG: '384696',
        situationVersionTime: '2026-09-11T05:41:43Z',
        situationRecord: [
          {
            sitRoadOrCarriagewayOrLaneManagement: {
              idG: '1-1742368657-0985c698',
              versionG: '1',
              roadOrCarriagewayOrLaneManagementType: { value: 'other' },
              source: { sourceIdentification: 'roadworks' },
              validity: {
                validityStatus: 'planned',
                validityTimeSpecification: {
                  overallStartTime: '2026-09-11T08:00:00Z',
                  overallEndTime: '2026-09-12T06:00:00Z',
                },
              },
              cause: { causeType: 'roadMaintenance' },
              generalPublicComment: [
                {
                  comment:
                    'M56 eastbound\nJ6 to J5 - mobile lane closures for resurfacing works',
                },
              ],
              locationReference: {
                locLocationGroupByList: {
                  locationContainedInGroup: [
                    {
                      locLinearLocation: {
                        gmlLineString: {
                          locGmlLineString: {
                            srsDimension: 2,
                            srsName: 'EPSG::4326',
                            posList: '53.352000 -2.310000 53.353000 -2.305000',
                          },
                        },
                        supplementaryPositionalDescription: {
                          locationDescription: 'M56 eastbound between J6 and J5',
                        },
                      },
                      locSingleRoadLinearLocation: {
                        linearWithinLinearElement: [
                          {
                            directionOnLinearSection: 'eastBound',
                            linearElement: {
                              locLinearElementByCode: {
                                roadName: 'M56',
                                linearElementReferenceModel: 'The Network Model',
                              },
                            },
                          },
                        ],
                      },
                    },
                    {
                      locLinearLocation: {
                        gmlLineString: {
                          locGmlLineString: {
                            posList: '53.354000 -2.300000 53.355000 -2.299000',
                          },
                        },
                        supplementaryPositionalDescription: {
                          locationDescription: 'M56 eastbound within the J5 junction',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    ],
  },
};

/** A single-location record, as the docs describe for unplanned closures. */
export const unplannedSingleLocation = {
  D2Payload: {
    situation: [
      {
        idG: '400001',
        situationRecord: [
          {
            sitRoadOrCarriagewayOrLaneManagement: {
              idG: 'unplanned-1',
              source: { sourceIdentification: 'incident' },
              validity: {
                validityStatus: 'active',
                validityTimeSpecification: {
                  overallStartTime: '2026-09-11T09:00:00Z',
                  overallEndTime: '2026-09-11T15:00:00Z',
                },
              },
              cause: { causeType: 'accident' },
              generalPublicComment: [{ comment: 'M60 clockwise\nJ3 - carriageway closed' }],
              locationReference: {
                locLinearLocation: {
                  gmlLineString: {
                    locGmlLineString: { posList: '53.420000 -2.220000 53.421000 -2.219000' },
                  },
                  supplementaryPositionalDescription: {
                    locationDescription: 'M60 clockwise at J3',
                  },
                },
                locSingleRoadLinearLocation: {
                  linearWithinLinearElement: [
                    { linearElement: { locLinearElementByCode: { roadName: 'M60' } } },
                  ],
                },
              },
            },
          },
        ],
      },
    ],
  },
};

/** Completed a week ago but still published as 'active', per the docs. */
export const completedButStillActive = {
  D2Payload: {
    situation: [
      {
        idG: '399999',
        situationRecord: [
          {
            sitRoadOrCarriagewayOrLaneManagement: {
              idG: 'stale-1',
              validity: {
                validityStatus: 'active',
                validityTimeSpecification: {
                  overallStartTime: '2026-09-01T08:00:00Z',
                  overallEndTime: '2026-09-04T06:00:00Z',
                },
              },
              generalPublicComment: [{ comment: 'M56 eastbound\nFinished resurfacing' }],
              locationReference: {
                locLinearLocation: {
                  gmlLineString: { locGmlLineString: { posList: '53.352000 -2.310000' } },
                  supplementaryPositionalDescription: { locationDescription: 'M56 eastbound' },
                },
                locSingleRoadLinearLocation: {
                  linearWithinLinearElement: [
                    { linearElement: { locLinearElementByCode: { roadName: 'M56' } } },
                  ],
                },
              },
            },
          },
        ],
      },
    ],
  },
};

/** Cancelled works, which the feed marks 'suspended'. */
export const suspended = {
  D2Payload: {
    situation: [
      {
        idG: '399998',
        situationRecord: [
          {
            sitRoadOrCarriagewayOrLaneManagement: {
              idG: 'suspended-1',
              validity: {
                validityStatus: 'suspended',
                validityTimeSpecification: {
                  overallStartTime: '2026-09-11T08:00:00Z',
                  overallEndTime: '2026-09-12T06:00:00Z',
                },
              },
              generalPublicComment: [{ comment: 'M56 eastbound\nCancelled' }],
              locationReference: {
                locLinearLocation: {
                  gmlLineString: { locGmlLineString: { posList: '53.352000 -2.310000' } },
                  supplementaryPositionalDescription: { locationDescription: 'M56 eastbound' },
                },
                locSingleRoadLinearLocation: {
                  linearWithinLinearElement: [
                    { linearElement: { locLinearElementByCode: { roadName: 'M56' } } },
                  ],
                },
              },
            },
          },
        ],
      },
    ],
  },
};

/** Far from Manchester — the original sample's Essex location. */
export const farAway = {
  D2Payload: {
    situation: [
      {
        idG: '384696',
        situationRecord: [
          {
            sitRoadOrCarriagewayOrLaneManagement: {
              idG: 'far-1',
              validity: {
                validityStatus: 'active',
                validityTimeSpecification: { overallEndTime: '2026-09-12T06:00:00Z' },
              },
              generalPublicComment: [{ comment: 'A120 both directions\nLitter clearance' }],
              locationReference: {
                locLinearLocation: {
                  gmlLineString: { locGmlLineString: { posList: '51.868835 0.525233' } },
                  supplementaryPositionalDescription: {
                    locationDescription: 'A120 eastbound near Rayne',
                  },
                },
                locSingleRoadLinearLocation: {
                  linearWithinLinearElement: [
                    { linearElement: { locLinearElementByCode: { roadName: 'A120' } } },
                  ],
                },
              },
            },
          },
        ],
      },
    ],
  },
};
